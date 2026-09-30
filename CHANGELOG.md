## Não publicado

- Adicionada validação de bodies, queries, params e headers necessários com Zod antes dos controllers.
- Adicionadas rotas de autenticação, cadastro restrito a administradores e redefinição de senha com hash `scrypt` e salt aleatório.
- Alterado o cadastro e a autenticação para utilizarem diretamente o login informado pelo cliente.
- Adicionado o model `User` com papéis de administrador e usuário para autenticação e alinhada a geração do Prisma Client com a importação usada pela aplicação.
- Definida a política do cookie de autenticação e removidos campos sensíveis de respostas da integração SAP.
- Adicionadas proteções HTTP com Helmet, HTTPS obrigatório em produção, CORS por lista de origens e limite de 10 KB para o body de extratos bancários.
- Centralizada a configuração de conexão do SAP Business One Service Layer por variáveis de ambiente.
- Migrado o código da aplicação de CommonJS para ECMAScript Modules.
- Adicionada a rota `GET /api/v1/filiais` com integração paginada ao SAP Business One Service Layer.
- Alterada a rota de extratos bancários para `POST /api/v1/extratos-bancarios`, com filtro de múltiplas empresas recebido no body.
- Adicionado ao endpoint de extratos bancários o filtro opcional `datas` para consulta de datas específicas.
- Ajustadas as mensagens e os códigos de validação dos filtros de extratos bancários por campo.
