"""
Motor de referência do Gêmeo Financeiro (Aware Investments): Família Andrade.

Implementação mínima em Python/NumPy da especificação em docs/SPEC.md.
Serve para conferir o motor em TypeScript: os resultados dele precisam cair
dentro das tolerâncias de reference/resultados_referencia.json.

Convenções da Fase 1 ("Motor no ciclo mensal", itens 2 e 3; mudança isolada
aprovada por Murilo em 04/10/2026):
  - sorteios alinhados por trajetória: cada trajetória tem um gerador para G
    e outro para Q, e o ano t usa sempre a linha t deles;
  - passo de 12 meses: a data de referência é o último dia do mês; o passo t
    cobre os 12 meses seguintes à data de referência mais t anos; o último
    termina no mês em que o membro mais jovem atinge a idade-limite e pode ter
    m < 12 meses, com retorno (1 + R)^(m/12) - 1; fluxos e eventos anuais
    entram pro rata pelos meses do seu ano civil que caem no passo; evento
    único e cada ocorrência de "a cada N anos" entram no seu mês (sem mês,
    julho); aposentado no passo t só se a aposentadoria foi antes do início do
    passo; sem corte nos últimos 15 passos.
Também como o motor em TypeScript (D-027): as regras de gasto flexível param
depois que a trajetória falha, e a trajetória de referência que zera fica em
zero (sem régua dali em diante).

Premissas ILUSTRATIVAS: não usar com clientes sem aprovação do comitê.

Uso (requer numpy):
  python3 reference/motor_referencia.py
  python3 reference/motor_referencia.py --json reference/resultados_referencia.json
"""
import argparse
import json

import numpy as np

# ---------------------------------------------------------------- premissas
CLASSES = ["POS", "INF", "PRE", "CRED", "MM", "ACOES", "FII", "INTL"]
MU = np.array([.040, .050, .045, .048, .048, .065, .050, .055])   # retorno real aritmético a.a.
SD = np.array([.015, .080, .050, .030, .060, .240, .140, .160])   # volatilidade a.a.
CORR = np.array([
    [1.00, .10, .20, .50, .30, -.05, .00, -.10],
    [.10, 1.00, .70, .30, .30, .45, .50, -.20],
    [.20, .70, 1.00, .30, .30, .40, .40, -.25],
    [.50, .30, .30, 1.00, .35, .30, .30, -.10],
    [.30, .30, .30, .35, 1.00, .45, .30, .10],
    [-.05, .45, .40, .30, .45, 1.00, .60, -.10],
    [.00, .50, .40, .30, .30, .60, 1.00, -.10],
    [-.10, -.20, -.25, -.10, .10, -.10, -.10, 1.00],
])
NU = 5                       # graus de liberdade da t multivariada
CLIP = 6.0                   # corte dos sorteios padronizados
WEIGHTS = np.array([25, 25, 5, 15, 10, 8, 4, 8]) / 100   # perfil moderado
FEE = 0.008                  # taxa de gestão a.a.
K = len(CLASSES)


# ---------------------------------------------------------------- calendário
def month_index(year, month):
    """Meses corridos desde o ano 0 (jan = 1)."""
    return year * 12 + (month - 1)


# ---------------------------------------------------------- Família Andrade
REFERENCE_MONTH = month_index(2026, 9)     # posições de 30/09/2026
FIRST_MONTH = REFERENCE_MONTH + 1          # out/2026
LAST_MONTH = month_index(1976 + 95, 8)     # Helena (ago/1976) completa 95 anos em ago/2071
N_MONTHS = LAST_MONTH - FIRST_MONTH + 1
T = -(-N_MONTHS // 12)                     # passos de 12 meses; o último pode ser mais curto
STEP_MONTHS = np.array([min(12, N_MONTHS - 12 * t) for t in range(T)])
STEP_FRAC = STEP_MONTHS / 12               # fração de ano de cada passo
RETIRE_MONTH = month_index(1974 + 62, 3)   # Ricardo (mar/1974) aos 62 anos: mar/2036
RETIRED = np.array([RETIRE_MONTH < FIRST_MONTH + 12 * t for t in range(T)])
W0 = 12_000_000 + 1_800_000  # CADM + VGBL
LEGACY = 3_000_000
ESSENTIAL = 660_000
LIFESTYLE = 360_000
MONTHLY_SPENDING = (ESSENTIAL + LIFESTYLE) / 12   # R$ 85 mil por mês
DEFAULT_EVENT_MONTH = 7      # evento sem mês entra em julho

# Regras de gasto flexível (padrão do SPEC)
LOWER, UPPER = 0.8, 1.2
CUT, RAISE = 0.10, 0.10
FLOOR, CAP = 0.5, 1.3
NO_CUT_LAST_STEPS = 15


def months_in_years(t, first_year, last_year):
    """Quantos meses do passo t caem nos anos civis de first_year a last_year (inclusivos)."""
    start = FIRST_MONTH + 12 * t
    end = start + STEP_MONTHS[t] - 1
    lo = max(start, month_index(first_year, 1))
    hi = min(end, month_index(last_year, 12))
    return max(0, hi - lo + 1)


def in_step(t, year, month=DEFAULT_EVENT_MONTH):
    """O mês (ano, mês) cai no passo t."""
    start = FIRST_MONTH + 12 * t
    return start <= month_index(year, month) < start + STEP_MONTHS[t]


def flows(t, mult=1.0):
    """Retorna (entradas, saídas de eventos, gasto essencial, estilo de vida) do passo t."""
    income = 84_000 * months_in_years(t, 2026, 2071) / 12                   # aluguel da sala
    income += (1_200_000 + 480_000) * months_in_years(t, 2026, 2035) / 12   # pró-labore + dividendos
    events = 180_000 * months_in_years(t, 2027, 2031) / 12                  # faculdade do Pedro (anual)
    events += 180_000 * months_in_years(t, 2031, 2035) / 12                 # faculdade da Laura (anual)
    events += sum(400_000 for y in range(2028, 2059, 5) if in_step(t, y))   # troca de carros, a cada 5 anos
    if in_step(t, 2035):
        events += 800_000                                                   # entrada do apartamento do Pedro
    spending = months_in_years(t, 2026, 2071) / 12
    return income, events, ESSENTIAL * spending * mult, LIFESTYLE * spending * mult


# ------------------------------------------------------------ sorteios
def standardized_t(rng, shape):
    g = rng.standard_normal(shape)
    q = rng.chisquare(NU, shape)
    return np.sqrt((NU - 2) / NU) * g / np.sqrt(q / NU)


def calibrate():
    """s_k e m_k: lognormal com média aritmética igual a MU (ln E[e^{sZ}] por Monte Carlo)."""
    s = np.sqrt(np.log(1 + SD ** 2 / (1 + MU) ** 2))
    rng = np.random.default_rng(123)
    z = np.clip(standardized_t(rng, 1_000_000), -CLIP, CLIP)
    m = np.array([np.log(1 + MU[k]) - np.log(np.mean(np.exp(s[k] * z))) for k in range(K)])
    return s, m


S, M = calibrate()
L = np.linalg.cholesky(CORR)   # falha se a matriz não for positiva definida


def portfolio_returns(n_paths, seed):
    """Matriz T x N de retornos reais anuais da carteira, líquidos da taxa de gestão.

    Sorteios alinhados: a trajetória i tem um gerador para G e outro para Q,
    semeados com a semente e i; o ano t usa a linha t de cada um, qualquer que
    seja o horizonte.
    """
    out = np.empty((T, n_paths))
    for i, child in enumerate(np.random.SeedSequence(seed).spawn(n_paths)):
        seq_g, seq_q = child.spawn(2)
        g = np.random.default_rng(seq_g).standard_normal((T, K))
        q = np.random.default_rng(seq_q).chisquare(NU, T)
        z = np.sqrt((NU - 2) / NU) * (g @ L.T) / np.sqrt(q / NU)[:, None]
        z = np.clip(z, -CLIP, CLIP)
        r = np.exp(M + S * z) - 1
        out[:, i] = (1 - FEE) * (1 + r @ WEIGHTS) - 1
    return out


# ------------------------------------------------------------ simulação
def step(W, F, R, frac):
    """Superávit entra no fim do passo; déficit sai no início. Retorna (W novo, falhou)."""
    g = (1 + R) ** frac
    pos = F >= 0
    fail = (~pos) & (W + F < 0)
    Wn = np.where(pos, W * g + F, (W + F) * g)
    return Wn, fail


def simulate(R, mult=1.0, rules=None, ref_path=None):
    """rules: None | 'trajetoria' | 'guyton_klinger'."""
    N = R.shape[1]
    W = np.full(N, W0, float)
    alive = np.ones(N, bool)
    mult_life = np.ones(N)               # multiplicador do estilo de vida planejado
    cut_any = np.zeros(N, bool)
    wr0 = np.full(N, np.nan)
    for t in range(T):
        inc, ev, ess, life_plan = flows(t, mult)
        retired = RETIRED[t]
        can_cut = t < T - NO_CUT_LAST_STEPS
        if rules and retired:
            if rules == "trajetoria":
                if ref_path[t] > 0:
                    ratio = W / ref_path[t]
                    down, up = ratio < LOWER, ratio > UPPER
                else:                    # a referência zerou: sem régua
                    down = up = np.zeros(N, bool)
            else:  # guyton_klinger: taxa de saque contra a inicial
                wr = np.maximum(0, -(inc - ev - ess - life_plan * mult_life)) / np.maximum(W, 1.0)
                known = ~np.isnan(wr0)
                down = known & (wr > UPPER * wr0)
                up = known & (wr < LOWER * wr0)
            down = down & can_cut & alive    # as regras param depois da falha
            up = up & alive
            mult_life = np.where(down, np.maximum(mult_life * (1 - CUT), FLOOR), mult_life)
            mult_life = np.where(up, np.minimum(mult_life * (1 + RAISE), CAP), mult_life)
            cut_any |= down
        F = inc - ev - ess - life_plan * mult_life
        if rules == "guyton_klinger" and retired:
            wr0 = np.where(np.isnan(wr0) & alive, np.maximum(0, -F) / np.maximum(W, 1.0), wr0)
        Wn, fail = step(W, F, R[t], STEP_FRAC[t])
        alive &= ~fail
        W = np.where(alive, Wn, 0.0)
    return {
        "prob": float(alive.mean()),
        "prob_legado": float((alive & (W >= LEGACY)).mean()),
        "mediana_final": float(np.median(W)),
        "chance_corte": float(cut_any.mean()),
    }


def deterministic_end(r, mult=1.0):
    """Patrimônio final com retorno real constante r; -1 se falhar no caminho."""
    W = W0
    for t in range(T):
        inc, ev, ess, life = flows(t, mult)
        F = inc - ev - ess - life
        g = (1 + r) ** STEP_FRAC[t]
        if F >= 0:
            W = W * g + F
        else:
            if W + F < 0:
                return -1.0
            W = (W + F) * g
    return W


def required_return(legacy):
    """Benchmark pessoal: menor retorno real constante que sustenta o plano (bisseção)."""
    lo, hi = -0.05, 0.20
    for _ in range(60):
        mid = (lo + hi) / 2
        if deterministic_end(mid) >= legacy:
            hi = mid
        else:
            lo = mid
    return hi


def reference_path(r):
    """Trajetória de referência do gasto flexível: plano completo, retorno constante r; zerou, fica em zero."""
    W, path, failed = W0, [W0], False
    for t in range(T):
        inc, ev, ess, life = flows(t)
        F = inc - ev - ess - life
        g = (1 + r) ** STEP_FRAC[t]
        if failed or W + F < 0:
            failed, W = True, 0.0
        else:
            W = W * g + F if F >= 0 else (W + F) * g
        path.append(W)
    return np.array(path)


def sustainable_monthly(R, target=0.90):
    """Maior gasto mensal total com probabilidade >= target (bisseção no multiplicador)."""
    lo, hi = 0.3, 3.0
    for _ in range(30):
        k = (lo + hi) / 2
        if simulate(R, mult=k)["prob"] >= target:
            lo = k
        else:
            hi = k
    return lo * MONTHLY_SPENDING


# ------------------------------------------------------------ resultados
def calcular(n_paths, seed):
    R = portfolio_returns(n_paths, seed)
    composto = float(np.exp(np.log1p(R).mean()) - 1)   # retorno anual de cada passo, todos os anos e trajetórias
    r_legado = required_return(LEGACY)
    r_sem = required_return(0.0)
    base = simulate(R)
    traj = simulate(R, rules="trajetoria", ref_path=reference_path(composto))
    gk = simulate(R, rules="guyton_klinger")
    gasto = sustainable_monthly(R)
    return [
        ("retorno_composto_liquido", "Retorno real composto do perfil moderado, líquido da taxa", composto, 0.0005, "fração ao ano", True),
        ("benchmark_com_legado", "Benchmark pessoal com legado de R$ 3 mi", r_legado, 0.0001, "fração ao ano", False),
        ("benchmark_sem_legado", "Benchmark pessoal sem legado", r_sem, 0.0001, "fração ao ano", False),
        ("folga", "Retorno composto menos benchmark com legado", composto - r_legado, 0.0005, "fração ao ano", True),
        ("prob_sucesso", "Probabilidade de sucesso, sem gasto flexível", base["prob"], 0.02, "fração", True),
        ("prob_legado", "Probabilidade do legado, sem gasto flexível", base["prob_legado"], 0.02, "fração", True),
        ("patrimonio_mediano_final", "Patrimônio mediano aos 95 anos, sem gasto flexível", base["mediana_final"], 1_500_000, "R$ de hoje", True),
        ("prob_sucesso_gasto_flexivel", "Probabilidade de sucesso, régua da trajetória de referência", traj["prob"], 0.01, "fração", True),
        ("chance_corte_trajetoria", "Chance de corte no estilo de vida, régua da trajetória de referência", traj["chance_corte"], 0.05, "fração", True),
        ("chance_corte_guyton_klinger", "Chance de corte no estilo de vida, régua Guyton-Klinger", gk["chance_corte"], 0.01, "fração", True),
        ("gasto_sustentavel_mensal_90", "Gasto mensal total sustentável com 90% de chance", gasto, 3_000, "R$ de hoje por mês", True),
    ]


def main():
    ap = argparse.ArgumentParser(description="Motor de referência do Gêmeo Financeiro")
    ap.add_argument("--trajetorias", type=int, default=50_000)
    ap.add_argument("--semente", type=int, default=42)
    ap.add_argument("--json", help="grava valores e tolerâncias neste arquivo")
    args = ap.parse_args()

    print(f"Passos: {T} (out/2026 a ago/2071; o último com {STEP_MONTHS[-1]} meses); aposentado a partir do passo {int(np.argmax(RETIRED))}\n")
    metricas = calcular(args.trajetorias, args.semente)
    for mid, desc, valor, tol, unidade, _ in metricas:
        print(f"{desc:<70} {valor:>16,.6f}  (±{tol:g} {unidade})")

    if args.json:
        payload = {
            "fonte": "reference/motor_referencia.py",
            "trajetorias": args.trajetorias,
            "semente": args.semente,
            "observacao": (
                "Premissas ilustrativas do SPEC. Convenções da Fase 1: sorteios alinhados por trajetória e "
                "passo de 12 meses a partir de 30/09/2026. Métricas com sorteio: compare pela tolerância, "
                "porque o gerador aleatório do motor em TypeScript é outro. Métricas sem sorteio "
                "(benchmark pessoal) precisam bater na tolerância indicada."
            ),
            "metricas": [
                {"id": mid, "descricao": desc, "valor": round(valor, 6), "tolerancia": tol,
                 "unidade": unidade, "sorteada": sorteada}
                for mid, desc, valor, tol, unidade, sorteada in metricas
            ],
        }
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\nGravado em {args.json}")


if __name__ == "__main__":
    main()
