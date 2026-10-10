// O pouco do Deno que as funções usam, para a checagem de tipos do projeto (o runtime do Supabase é compatível com o
// Deno 2): servir requisições e ler variáveis de ambiente.
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
  const env: { get(name: string): string | undefined }
}
