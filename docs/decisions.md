# Decisões Técnicas

## 2026-10-09 — Logging estruturado e contexto assíncrono

O logging operacional utiliza Pino e Pino HTTP em JSON. Cada requisição recebe um UUID interno e o `AsyncLocalStorage` preserva o contexto durante operações assíncronas sem exigir que controllers, services e repositories recebam esses valores como parâmetros técnicos.

O logger não serializa body, query ou headers completos. A configuração central aplica redaction a nomes sensíveis e o serializador de erros restringe a saída a tipo, mensagem, stack e código.

O `pino-pretty` é uma dependência de desenvolvimento e funciona como transport apenas fora de produção. Logs de produção continuam em JSON estruturado para preservar desempenho e compatibilidade com coletores.

A auditoria usa uma tabela separada dos logs operacionais. O primeiro evento implementado é `HTTP_REQUEST_COMPLETED`; eventos de negócio serão adicionados nas etapas seguintes. O `metadata` é filtrado por allow-list no service antes da persistência.
