# Implementação FBL5N — sete SQLQueries parametrizadas

## Objetivo

Otimizar a geração do relatório FBL5N para que termine em no máximo
cinco minutos, preservando integralmente as regras de negócio existentes.

## Decisão adotada

Dividir a consulta em sete SQLQueries parametrizadas:

1. FBL5N_LC
2. FBL5N_NS
3. FBL5N_CR
4. FBL5N_RI
5. FBL5N_AD
6. FBL5N_JU_LCM
7. FBL5N_DS_LCM

## Restrições obrigatórias

- Não criar tabelas auxiliares, temporárias persistentes ou tabelas de apoio.
- Não alterar a lógica funcional do SQL original.
- Não alterar o conjunto final de registros retornados.
- Não remover regras existentes do projeto.
- Usar parâmetros SQL; não concatenar valores recebidos pelo usuário.
- Aplicar os filtros o mais cedo possível em cada SQLQuery.
- Utilizar IN parametrizado quando o filtro possuir múltiplos valores.
- Preservar a semântica de joins, filtros, cálculos e agrupamentos.
- O processamento completo deve terminar em no máximo cinco minutos.

## Fonte da verdade

- O SQL original do relatório define o comportamento funcional esperado.
- A implementação existente contém as regras de negócio que devem ser
  reutilizadas.
- Antes de modificar qualquer arquivo, comparar as sete consultas com o
  SQL original e identificar a origem de cada coluna do resultado.

## Estratégia

- Executar apenas as consultas necessárias para os filtros recebidos.
- Reaproveitar os mesmos parâmetros nas sete SQLQueries.
- Executar consultas independentes com concorrência controlada.
- Consolidar os resultados em memória, utilizando as mesmas chaves e
  precedências do SQL original.
- Evitar consultas por registro e qualquer padrão N+1.
- Não usar DISTINCT apenas para esconder duplicações introduzidas pelos
  joins ou pela consolidação.

## Validação

Comparar a implementação nova com a implementação original usando:

- conjunto pequeno de documentos;
- múltiplas empresas;
- períodos com e sem movimentação;
- documentos sem dados em consultas complementares;
- valores nulos;
- duplicidades;
- filtros vazios e múltiplos valores;
- cenário representativo de produção.

Para a mesma entrada, o resultado deve possuir os mesmos registros e
valores da implementação original, independentemente da ordem quando
ela não fizer parte do contrato.

Registrar separadamente:

- tempo de cada SQLQuery;
- tempo de consolidação;
- tempo total;
- quantidade de linhas retornada por consulta;
- quantidade final de registros.

## Artefatos no repositório

`npm run fbl5n:sqlqueries` deriva os sete arquivos em `docs/implementation/sqlqueries/` a partir de `FBL5N.sql`, mantendo cada ramo de `UNION ALL` e a projeção final. O manifesto `definitions.json` contém `SqlCode`, `SqlName` e `SqlText` para cadastro controlado no SAP. A rota `POST /api/v1/fbl5n` utiliza esses códigos depois de cadastrados.

A implementação envia os limites de filial e datas já aceitos pelas SQLQueries. Arrays sem faixa explícita geram partições com limites iguais, ou intervalos quando os valores são consecutivos, executadas no SAP e reunidas sem eliminar duplicatas. A lista de clientes é dividida em lotes de até 25 códigos distintos; cada lote usa `IN (:c0, ..., :c24)` nas sete SQLQueries e é concluído antes do lote seguinte. Posições livres repetem um código do lote. Faixas de cliente continuam usando comparações inclusivas `>= :clienteInicial` e `<= :clienteFinal`, com precedência sobre a lista. Sem cliente, a integração chama as sete consultas com sufixo `_BASE`, que preservam os textos anteriores. O service apenas rejeita uma resposta fora dos filtros; não filtra registros localmente. Nenhum filtro é obrigatório. O arquivo `FBL5N_7_SQLQueries_ServiceLayer.json` guarda a referência original e `FBL5N_7_SQLQueries_ServiceLayer_filtradas.json` contém a versão atualizada.

Em 22/10/2026, as sete consultas temporárias foram executadas no SAP com a mesma entrada das consultas originais; as comparações de resultado e multiplicidade passaram. As sete SQLQueries cadastradas receberam o filtro de cliente e foram verificadas por leitura. As sete consultas `_BASE` também foram cadastradas e verificadas. Testes da rota autenticada com cliente e uma execução sem cliente retornaram dados. A execução sem cliente foi mais lenta, pois as consultas base processam um universo maior. O desempenho com combinações grandes de arrays e a meta original de cinco minutos ainda precisam de medição específica. O script `scripts/compareFbl5nResults.js` compara duas exportações JSON sem mostrar conteúdo financeiro na saída.

```text
node scripts/compareFbl5nResults.js original.json otimizado.json
```

Cada arquivo deve conter um array de registros ou `{ "data": [...] }`. A saída informa as quantidades original, otimizada, faltante e adicional, além de `equivalent`. As exportações devem usar a mesma entrada e permanecer fora do versionamento quando contiverem dados financeiros.
