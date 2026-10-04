"""
Motor de referência do Gêmeo Financeiro (Aware Investments): Família Andrade.

Implementação mínima em Python/NumPy da especificação em docs/SPEC.md.
Serve para conferir o motor em TypeScript: os resultados dele precisam cair
dentro das tolerâncias de reference/resultados_referencia.json.

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

# ---------------------------------------------------------- Família Andrade
BASE_YEAR = 2026             # ano civil do passo t = BASE_YEAR + t
T = 45                       # Helena dos 50 aos 95 anos
W0 = 12_000_000 + 1_800_000  # CADM + VGBL
LEGACY = 3_000_000
RETIRE_YEAR = 2036           # Ricardo aos 62
ESSENTIAL = 660_000
LIFESTYLE = 360_000
MONTHLY_SPENDING = (ESSENTIAL + LIFESTYLE) / 12   # R$ 85 mil por mês

# Regras de gasto flexível (padrão do SPEC)
LOWER, UPPER = 0.8, 1.2
CUT, RAISE = 0.10, 0.10
FLOOR, CAP = 0.5, 1.3
NO_CUT_LAST_YEARS = 15


def flows(t, mult=1.0):
    """Retorna (entradas, saídas de eventos, gasto essencial, estilo de vida) do passo t."""
    y = BASE_YEAR + t
    income = 84_000                                   # aluguel da sala
    if y <= 2035:
        income += 1_200_000 + 480_000                 # pró-labore + dividendos
    events = 0
    if 2027 <= y <= 2031:
        events += 180_000                             # faculdade do Pedro
    if 2031 <= y <= 2035:
        events += 180_000                             # faculdade da Laura
    if 2028 <= y <= 2058 and (y - 2028) % 5 == 0:
        events += 400_000                             # troca de carros
    if y == 2035:
        events += 800_000                             # entrada do apartamento do Pedro
    return income, events, ESSENTIAL * mult, LIFESTYLE * mult


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
    """Matriz T x N de retornos reais da carteira, líquidos da taxa de gestão."""
    rng = np.random.default_rng(seed)
    out = np.empty((T, n_paths))
    for t in range(T):
        g = rng.standard_normal((n_paths, K))
        q = rng.chisquare(NU, n_paths)
        z = np.sqrt((NU - 2) / NU) * (g @ L.T) / np.sqrt(q / NU)[:, None]
        z = np.clip(z, -CLIP, CLIP)
        r = np.exp(M + S * z) - 1
        out[t] = (1 - FEE) * (1 + r @ WEIGHTS) - 1
    return out


# ------------------------------------------------------------ simulação
def step(W, F, R):
    """Superávit entra no fim do ano; déficit sai no início. Retorna (W novo, falhou)."""
    pos = F >= 0
    fail = (~pos) & (W + F < 0)
    Wn = np.where(pos, W * (1 + R) + F, (W + F) * (1 + R))
    return Wn, fail


def simulate(R, mult=1.0, rules=None, ref_path=None):
    """rules: None | 'trajetoria' | 'guyton_klinger'."""
    N = R.shape[1]
    W = np.full(N, W0, float)
    alive = np.ones(N, bool)
    life0 = LIFESTYLE * mult
    life = np.full(N, life0)
    cut_any = np.zeros(N, bool)
    wr0 = np.full(N, np.nan)
    for t in range(T):
        inc, ev, ess, _ = flows(t, mult)
        retired = BASE_YEAR + t >= RETIRE_YEAR
        can_cut = (T - t) > NO_CUT_LAST_YEARS
        if rules and retired:
            if rules == "trajetoria":
                ratio = W / max(ref_path[t], 1.0)
                down, up = ratio < LOWER, ratio > UPPER
            else:  # guyton_klinger: taxa de saque contra a inicial
                wr = np.maximum(0, -(inc - ev - ess - life)) / np.maximum(W, 1.0)
                known = ~np.isnan(wr0)
                down = known & (wr > UPPER * wr0)
                up = known & (wr < LOWER * wr0)
            down = down & can_cut
            life = np.where(down, np.maximum(life * (1 - CUT), FLOOR * life0), life)
            life = np.where(up, np.minimum(life * (1 + RAISE), CAP * life0), life)
            cut_any |= down
        F = (inc - ev - ess - life) * np.ones(N)
        if rules == "guyton_klinger" and retired:
            wr0 = np.where(np.isnan(wr0) & alive, np.maximum(0, -F) / np.maximum(W, 1.0), wr0)
        Wn, fail = step(W, F, R[t])
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
        if F >= 0:
            W = W * (1 + r) + F
        else:
            if W + F < 0:
                return -1.0
            W = (W + F) * (1 + r)
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
    """Trajetória de referência do gasto flexível: plano completo, retorno constante r."""
    W, path = W0, [W0]
    for t in range(T):
        inc, ev, ess, life = flows(t)
        F = inc - ev - ess - life
        W = W * (1 + r) + F if F >= 0 else max(W + F, 0.0) * (1 + r)
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
    composto = float(np.exp(np.log1p(R).mean()) - 1)
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

    metricas = calcular(args.trajetorias, args.semente)
    for mid, desc, valor, tol, unidade, _ in metricas:
        print(f"{desc:<70} {valor:>16,.6f}  (±{tol:g} {unidade})")

    if args.json:
        payload = {
            "fonte": "reference/motor_referencia.py",
            "trajetorias": args.trajetorias,
            "semente": args.semente,
            "observacao": (
                "Premissas ilustrativas do SPEC. Métricas com sorteio: compare pela tolerância, "
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
