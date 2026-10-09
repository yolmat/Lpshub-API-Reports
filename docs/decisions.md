# Decisões Técnicas

## 2026-10-09 — Logging estruturado e contexto assíncrono

O logging operacional utiliza Pino e Pino HTTP em JSON. Cada requisição recebe um UUID interno e o `AsyncLocalStorage` preserva o contexto durante operações assíncronas sem exigir que controllers, services e repositories recebam esses valores como parâmetros técnicos.

O logger não serializa body, query ou headers completos. A configuração central aplica redaction a nomes sensíveis e o serializador de erros restringe a saída a tipo, mensagem, stack e código.

O `pino-pretty` é uma dependência de desenvolvimento e funciona como transport apenas fora de produção. Logs de produção continuam em JSON estruturado para preservar desempenho e compatibilidade com coletores.

A auditoria usa uma tabela separada dos logs operacionais. O primeiro evento implementado é `HTTP_REQUEST_COMPLETED`; eventos de negócio serão adicionados nas etapas seguintes. O `metadata` é filtrado por allow-list no service antes da persistência.

## 2026-10-09 — Trilha corporativa append-only

O `AuditLog` registra eventos e ações semânticas por enums fechados. A tabela não possui relação com `User`, preservando `userId` e `username` como snapshots imutáveis. O repository expõe somente inserção.

Request e response completos não são persistidos. A aplicação registra contagens, tamanho da resposta e filtros resumidos; a sessão é representada por SHA-256. `responseHash` permanece uma evolução futura porque seu contrato e custo ainda não foram definidos.

Todas as respostas aguardam a auditoria, exceto login e logout. Essas duas operações registram eventos explícitos no `authService`, mas não atrasam a resposta enquanto o `INSERT` termina.

## 2026-10-09 — Catálogo obrigatório de auditoria por rota

Método, caminho e configuração semântica de auditoria ficam unidos em `AUDITED_ROUTES`. As rotas usam o caminho do catálogo e o middleware global resolve sua ação antes dos demais middlewares. Testes impedem rotas catalogadas sem ação ou com `HTTP_REQUEST` genérico.
