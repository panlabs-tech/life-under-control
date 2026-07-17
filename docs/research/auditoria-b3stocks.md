# Auditoria do b3stocks — o padrão familiar contra o código real

Ticket [#222](https://github.com/ThiagoPanini/life-under-control/issues/222) do mapa wayfinder #219. Objeto de estudo: `~/workspaces/b3stocks`, lido em modo somente-leitura. Citações são `arquivo:linha` relativas à raiz do b3stocks. O legado em `tmp/` foi tratado como não-canônico e ignorado; o código auditado é `app/src/features/` (vertical slices) mais `infra/` (Terraform), `.pylintrc`, `.github/`, `requirements.txt`.

Cada eixo separa **fato observado** (com citação) de **interpretação**. Forças e fraquezas recebem o mesmo rigor. Onde o padrão familiar do dono — Vertical Slice + Clean/Hexagonal, interfaces em ABC, adapter por herança de contrato — se sustenta, digo; onde é cerimônia sem garantia, também.

## Veredito de uma linha

O **esqueleto** do padrão está presente e é uniforme (slices, ABCs como ports, adapters herdando contrato, DI por dataclass + composition root no handler); a **garantia** que esse esqueleto deveria comprar está quase toda ausente, porque não há régua que a force — sem checador de tipos (o mypy foi removido), sem import-linter, e com o pylint configurado para calar exatamente os avisos que pegariam os problemas reais. O resultado é um código que *parece* Clean/Hexagonal e viola a própria fronteira em vários pontos concretos, alguns deles bugs vivos.

O `README.md:233` afirma: "The codebase strictly follows Clean Architecture and SOLID principles". A auditoria mostra que "strictly" é aspiracional — a estrutura segue, a disciplina não é verificada e é rompida na prática.

---

## 1. Mecanismo de contrato

**Fato.** Todo contrato é uma classe `ABC` com métodos `@abstractmethod` (ex.: `app/src/features/cross/domain/interfaces/http_client_adapter.py:1,7,12`). Convenção de nome com prefixo `I` (`IHTTPClientAdapter`, `IDatabaseRepository`, `ITopicAdapter`). Os métodos são anotados e documentados.

**Força.** É consistente em 100% dos ports (13 interfaces conferidas) e dá uma garantia real, ainda que mínima: uma subclasse que não implemente um `@abstractmethod` não instancia (`TypeError` em tempo de construção). Como os adapters são instanciados no import do handler (composition root), essa checagem dispara cedo.

**Fraqueza.** A garantia da ABC cobre apenas a **existência dos nomes de método**, não a **assinatura** nem os **tipos**. Sem checador de tipos (ver eixo 16), qualquer deriva de assinatura entre interface e adapter passa. Exemplo vivo: a interface declara `placeholders: Optional[dict[str, Any]] = None` (`app/src/features/send_batch_completion_emails/domain/interfaces/email_service_adapter_interface.py:19`) e o adapter implementa `placeholders: dict[str, Any] = None` (`app/src/features/send_batch_completion_emails/infra/adapters/ses_mail_service_adapter.py:45`) — `Optional` sumiu, ninguém reclama.

## 2. Onde os contratos moram e como se descobrem

**Fato.** Cada slice tem `domain/interfaces/`; o compartilhado vive em `cross/domain/interfaces/`. Os value objects têm fachada de reexport (`app/src/features/cross/domain/value_objects/__init__.py` reexporta os 6 enums), mas o `__init__.py` de `cross/domain/entities/` está **vazio** — entidades são importadas por caminho completo.

**Força.** Localidade: para entender uma feature, você abre uma pasta e vê `domain/`, `infra/`, `use_case/`, `presentation/`. Descoberta por convenção funciona bem no eixo horizontal (achar a feature).

**Fraqueza.** Descoberta por nome de contrato é ruidosa por causa de colisões (ver eixo 3). E a fachada é inconsistente: VOs têm reexport, entidades não têm `__all__` nem fachada, então a "borda de kernel" não é uniforme.

## 3. Granularidade dos contratos

**Fato — bom (ISP honrado na maioria).** A maioria dos ports é de método único: `IHTTPClientAdapter.get` (um método), `IDatabaseRepository.batch_insert_items` (um), `ITopicAdapter.publish_message` (um). Interfaces pequenas e segregadas.

**Fato — ruim (um port gordo e vazado).** `IDataCatalogAdapter` expõe **5 métodos** (`app/src/features/delete_already_processed_partitions/domain/interfaces/data_catalog_adapter_interface.py:12-74`): `get_partitions`, `check_partition_exists`, `delete_logical_partition_from_data_catalog`, `delete_physical_partition_from_storage`, `delete_processed_partitions`. Mas o use-case só chama **um** deles — `delete_processed_partitions` (`app/src/features/delete_already_processed_partitions/use_case/delete_already_processed_partitions_use_case.py:50`). Os outros quatro são passos internos do algoritmo que vazaram para a superfície do port.

**Fato — colisões de nome.** Dois `IDatabaseRepository` diferentes coexistem: um recebe `list[Stock]` (`get_active_stocks/.../database_repository_interface.py:11`), outro `list[FundamentusStockMetrics]` (`get_fundamentus_eod_stock_metrics/.../database_repository_interface.py:16`). Dois `ITopicAdapter` divergentes: `batch_publish_messages(list[StockMessageEnvelop])` (`get_active_stocks/.../topic_adapter_interface.py:12`) vs `publish_message(BatchProcess)` (`check_batch_processes_completion/.../topic_adapter_interface.py:12`).

**Interpretação.** A colisão em si é aceitável sob vertical slice (módulos isolados), mas mina o próprio argumento de "interfaces segregadas descobríveis": o nome não identifica o contrato. E o `IDataCatalogAdapter` gordo é o oposto de ISP — o port é 5x maior do que o único método que o consumidor usa, para expor sub-passos que só ele mesmo chama.

## 4. Conformidade adapter × contrato

**Fato.** Todo adapter herda seu ABC: `SNSTopicAdapter(ITopicAdapter)`, `FundamentusHTMLParserAdapter(IHTMLParserAdapter)`, `RequestsHTTPClientAdapter(IHTTPClientAdapter)`, `DynamoDBBatchControlDatabaseRepository(IBatchControlDatabaseRepository)`, `AWSRanglerDataCatalogAdapter(IDataCatalogAdapter)`, etc. (verificado nas 10 classes de adapter/repo). A autoimagem do dono — "substituição de adapters por herança de contrato" — **procede estruturalmente**.

**Força.** Herança nominal uniforme; a intenção de DIP é legível em cada `class XxxAdapter(IXxx)`.

**Fraqueza.** Conformidade é só nominal. Sem mypy/pyright (eixo 16), a aderência de assinatura/tipo não é checada em lugar nenhum — só a presença dos nomes de método (garantia da ABC). O port de e-mail com flag booleana (`send_email(..., replace_placeholders=False, ...)`) produziu um bug vivo justamente porque a forma do contrato não foi verificada contra o uso (ver eixo Bugs, item 2).

## 5. Fakes / dublês de teste

**Fato.** Não existe **nenhuma** classe `Fake`/`Stub` no repositório (busca em `app/` retorna zero; o único acerto é o diretório `tests/mocks/` de eventos AWS mockados). Os dublês são `unittest.mock.Mock` e `@patch`: `Mock(spec=AWSRanglerDataCatalogAdapter)` (`app/tests/test_delete_already_processed_partitions.py:92`) e `@patch("...awsrangler_data_catalog_adapter.wr")` (`:195`).

**Interpretação — a autoimagem NÃO se realiza aqui.** O modelo mental do dono (dublê = substituto por herança de contrato) não é o que os testes fazem. Dois pontos:
- O `Mock(spec=...)` é ancorado no **adapter concreto** (`AWSRanglerDataCatalogAdapter`), não no port `IDataCatalogAdapter`. O seam de teste é a classe concreta, não a abstração — a ABC não compra nada no teste.
- Os testes de adapter fazem `@patch` do módulo `wr` (awswrangler) e afirmam chamadas de biblioteca: `mock_wr.catalog.get_partitions.assert_called_once_with(database=..., table=...)` (`:212`). Isso é teste caixa-branca acoplado à implementação; refatorar o corpo quebra o teste mesmo com comportamento idêntico.

**Fraqueza.** Sem fakes que implementem os ports, não há teste que valide que "trocar de adapter" preserva contrato — que é exatamente a promessa que a arquitetura faz. O dublê testa o desenho atual, não a substituibilidade.

## 6. DI / composition root

**Fato.** Cada `presentation/*.py` é o composition root: instancia adapters/repos **em nível de módulo** e monta o use-case, expondo `handler(event, context)` (ex.: `app/src/features/get_active_stocks/presentation/get_active_stocks_presentation.py:21-32,36`). DI é injeção por construtor via dataclass.

**Força.** Padrão uniforme, sem container mágico, sem framework de DI — legível e explícito. Adequado a Lambda: adapters vivem no escopo do módulo e são reusados entre invocações (cold start paga uma vez).

**Fraqueza — efeito colateral pesado no import.** Como a instanciação é no import, importar o handler dispara I/O: `SNSTopicAdapter.__init__` faz `boto3.client("sts").get_caller_identity()` (`app/src/features/get_active_stocks/infra/adapters/sns_topic_adapter.py:22,35`), ou seja, uma chamada STS de rede ao importar o módulo de apresentação. Isso torna o import não-testável sem credenciais AWS e é a razão de os testes precisarem `@patch` do `use_case` inteiro do módulo (`test_...py:540`).

**Fraqueza menor — inconsistência.** A maioria dos use-cases é `@dataclass(frozen=True)` (`get_active_stocks_use_case.py:26`), mas `delete_already_processed_partitions_use_case.py:17` e `send_notification_emails_use_case.py:21` são `@dataclass` mutável.

## 7. Forma do use-case

**Fato.** Dataclass com ports como campos; método `execute() -> OutputDTO`; corpo em `try/except Exception: logger.exception(...); raise`. Uniforme nos 7 use-cases.

**Fraqueza — o "núcleo" não é puro; vaza borda e config.** O ideal Hexagonal ("core isolado da borda") é rompido dentro do use-case:
- **`os.getenv` no meio do core**: 6 ocorrências em 4 use-cases (`check_batch_processes_completion_use_case.py:84`, `get_active_stocks_use_case.py:98-99`, `get_fundamentus_eod_stock_metrics_use_case.py:146`, `send_batch_processes_emails_use_case.py:72,74`). O use-case lê ambiente para montar a resposta e o remetente.
- **URL e política HTTP hardcoded no core**: `get_active_stocks_use_case.py:53-63` embute a URL do Fundamentus, User-Agent, timeout e retry dentro do use-case.
- **Relógio real no core**: `send_batch_processes_emails_use_case.py:83` chama `datetime.now()` direto (sem Clock injetado).
- **Sobra de código**: `send_batch_processes_emails_use_case.py:85` tem `"execution_time": "teste"` — string pt-BR de teste esquecida em produção.
- **Import de infra no core (e morto)**: `delete_already_processed_partitions_use_case.py:3` faz `import awswrangler as wr` — biblioteca de data-lake importada num arquivo de use-case, e **nunca usada** no corpo. É simultaneamente violação de camada e import morto. Só sobrevive porque não há import-linter e o pylint não derruba a nota por um único `unused-import` num pacote grande (eixo 16).
- **Lógica de transformação no core**: `store_dynamodb_streams_data_use_case.py:73-102` faz parsing de ARN por regex e derivação de campos em métodos privados `__` — trabalho de mapper morando no use-case.

**Fraqueza — bugs de entrada vazia.** `check_batch_processes_completion_use_case.py:82` referencia `batch_process` após o `for` (NameError se `records` vier vazio); `store_dynamodb_streams_data_use_case.py:171` acessa `streams_output_data[0]` sem guarda (IndexError se vazio). Nenhum é coberto por teste.

**Força.** Apesar disso, os use-cases são curtos, lineares e legíveis; a estrutura ports-as-fields + `execute()` é boa e o logging é consistente.

## 8. DTOs e validação

**Fato.** DTOs são dataclasses estruturais sem validação: `StockMessagesInputDTO` é só `messages: list[StockMessageEnvelop]` (`app/src/features/get_fundamentus_eod_stock_metrics/domain/dtos/stock_messages_input_dto.py:6-11`); `DynamoDBStreamsInputDTO` é só `records: list[...]` (`cross/domain/dtos/dynamodb_streams_input_dto.py:8-13`). Não há pydantic/marshmallow/schema em lugar nenhum (`requirements.txt` não traz nenhum validador).

**Fato — coerção silenciosa no lugar de validação.** `SerializationUtils.json_serialize` transforma toda string igual a `'nan'`, `'n/a'`, `'null'` ou `''` em `None` (`cross/utils/serialization.py:34-37`), de forma invisível e uniforme; e converte `Decimal → float` (`:57`).

**Interpretação.** A postura é "coagir, não validar". Entrada malformada não é rejeitada na borda — vira `KeyError`/`ValueError` lá dentro, apanhado pelo catch-all. Para um app financeiro, dois pontos são sérios: (a) `Decimal → float` joga métricas monetárias (P/L, dividend yield, cotação) para ponto flutuante — exatamente o antipadrão que o LUC proíbe; (b) a coerção de `'null'/'n/a' → None` pode apagar valor legítimo sem sinal.

## 9. Topologia

**Fato.** 7 Lambdas (7 funções `handler`), IaC em Terraform (`infra/*.tf`: `lambda_functions.tf`, `lambda_functions_streams.tf`, `sqs_queues.tf`, `sns_topics.tf`, `dynamodb_tables.tf`, `glue_catalog_tables_cdc.tf`/`_sor.tf`, `ses.tf`, `s3_buckets.tf`, `lambda_layers.tf`). Pipeline event-driven: scrape lista de ações → SNS → SQS → scrape métricas por ação → DynamoDB → Streams → CDC/SoR no data lake; controle de batch → SNS → e-mail. A "presentation" é o adapter de borda (Lambda) e o composition root ao mesmo tempo.

**Força.** Desenho serverless coerente, uma responsabilidade por Lambda, deploy versionado em Terraform ao lado do código. Vertical slice casa bem com "uma Lambda por feature".

**Fraqueza — cerimônia HTTP em gatilho não-HTTP.** Todo handler retorna `{"statusCode", "headers", "body"}` via `HTTPResponseMapper.map` (ex.: `get_active_stocks_presentation.py:57`), mas os gatilhos são SQS/SNS/DynamoDB Streams (assíncronos) — ninguém lê `statusCode` de uma Lambda disparada por SQS. A forma de resposta HTTP é ritual sem consumidor.

## 10. Kernel / schema

**Fato.** `cross/` é um kernel compartilhado **gordo**: além de primitivos (VOs, DTOs, entidades como `BatchProcess`), guarda **infra concreta** — o adapter HTTP `requests` (`cross/infra/adapters/requests_http_client_adapter.py`), o repositório DynamoDB de controle de batch (`cross/infra/repositories/dynamodb_batch_control_database_repository.py`) e mappers. Não há conceito de schema/migração: os PynamoDB `Model` definem as tabelas (`StockModel`, `FundamentusStockMetricsModel`, `BatchProcessControlModel`), com `table_name = os.getenv(...)` avaliado **no import** e re-setado no `__init__` (`.../dynamodb_batch_control_database_repository.py:31,44`).

**Interpretação.** O guia do LUC quer kernel mínimo (só o que 2+ contextos usam). Aqui `BatchProcess` e o cliente HTTP são genuinamente compartilhados, mas colocar um repositório DynamoDB concreto e um adapter `requests` dentro do kernel torna-o um contexto por si só — a fronteira "shared = mínimo" não é observada. O acoplamento `Model ↔ env no import` também amarra o schema à presença de variável de ambiente no cold start.

## 11. Modelo de erro

**Fato.** Zero exceções de domínio. A busca por `class *Error`/`class *Exception` acha só `ExceptionInfo` (`cross/domain/entities/exception_info.py`), que é uma **entidade de dados**, não um tipo levantável. O modelo é: exceções embutidas + catch-all `except Exception` + `logger.exception` + `raise` (61 `raise` no total). O `EnvironmentVarsUtils` levanta `EnvironmentError` embutido (`cross/utils/env.py:18`).

**Fato — caminho de erro morto.** `OutputDTO` tem `.fail(error)` e o `HTTPResponseMapper.map` traz um mapeamento elaborado de string de erro para status code (404/401/403/409/400/500 por substring — `cross/infra/mappers/http_response_mapper.py:38-54`). Mas **nenhum use-case chama `OutputDTO.fail`** (busca retorna zero); todos só fazem `OutputDTO.ok(...)` e dão `raise` no erro. Como o `raise` estoura antes de chegar ao mapper, todo o galho de erro→status é código que nunca executa.

**Fato — `ExceptionInfo` está quebrado e silenciado.** `to_template_dict` referencia `self.occurred_at`, `self.retry_count`, `self.process_id`, `self.fingerprint`, `self.category` (`exception_info.py:47,52,54,55,61`) — **nenhum é campo declarado** (os campos são `exception_type`, `exception_message`, ... `root_cause_hint`). Chamar o método daria `AttributeError`. A classe carrega `# pylint: disable=no-member` (`:39`) para calar o aviso que denunciaria isso, e está **inteiramente sem uso** no código (busca confirma).

**Interpretação.** Este eixo é o retrato da tese: cerimônia (um `OutputDTO` com `.fail` e um mapeador de status rico; uma entidade "abrangente" de erro) sem garantia (o caminho não roda; a entidade é dead code provado quebrado, com o linter mandado calar sobre a prova).

## 12. Configuração

**Fato.** `os.getenv` espalhado (use-cases, adapters, `Model.Meta`), sem objeto central de Settings. Validação de config é só presença: `EnvironmentVarsUtils.check_required_env_vars` (`cross/utils/env.py:16-18`), chamada em cada handler com uma lista hardcoded de vars. `.env` na raiz (verificado: **não** rastreado no git — é local, não há segredo commitado). `AWSClient.get_client` tem default de região avaliado no import: `region_name: str = boto3.session.Session().region_name` (`cross/utils/aws_client.py:10`) — argumento-default perigoso (cria uma Session boto3 no import só para computar o default).

**Interpretação.** Sem tipagem/parse/default central de config; cada handler repete sua própria lista de vars requeridas, que nem sempre bate com o que o use-case de fato lê. O default de região no import é um bug latente clássico (avaliado uma vez, no carregamento) — e o `W0102 dangerous-default-value` está desligado no `.pylintrc` (eixo 16), então nunca é apontado.

## 13. Async

**Fato.** Nenhum `async`/`await`/`asyncio` no código. Tudo síncrono.

**Interpretação.** Correto para Lambda simples. Mas o laço de scraping por ação em `get_fundamentus_eod_stock_metrics_use_case.py:79-104` é sequencial (uma requisição HTTP por ação, em série); não há concorrência nem batching de I/O. Não é bug, é teto de throughput deixado na mesa — aceitável dado o fan-out por SQS que distribui a carga entre invocações.

## 14. Transações

**Fato.** Nenhum uso transacional (`transact_write`/atomic/commit/rollback ausentes). A atualização do controle de batch é não-transacional: `BatchProcessControlModel.get(...)` seguido de `.update(actions=[... .add(...) ...])` (`cross/infra/repositories/dynamodb_batch_control_database_repository.py:66-107`).

**Fraqueza.** Com múltiplas Lambdas processando o mesmo batch em paralelo (fan-out por SQS), o par read-then-write sem condição/transação é uma corrida. O `.add()` atômico do DynamoDB no contador (`:100`) mitiga parte, mas a decisão de conclusão lê `processed_items`/`total_items` e escreve `COMPLETED` sem guarda condicional (`:133-145`) — dá para dois processos marcarem conclusão. Não há teste que exercite concorrência.

**Interpretação adicional — regra de domínio na infra.** A decisão "processados ≥ total ⇒ COMPLETED" mora no **repositório** (`:133-145`), não no use-case; o use-case só chama `update_batch_process_control` e depois `check_batch_process_completion` (`get_fundamentus_eod_stock_metrics_use_case.py:125-130`) e confia que a infra decida e escreva. Além disso, o método chamado `check_...` (nome de consulta) na verdade **muta estado** e retorna `None` — viola separação comando/consulta e a docstring que diz "Checks if...".

## 15. Doutrina de testes

**Fato.** Um único módulo pytest real: `app/tests/test_delete_already_processed_partitions.py` (617 linhas, ~30 testes) — para **1 das 7 features**. As outras 6 (get_active_stocks, get_fundamentus, store_dynamodb_streams_data, check_batch_processes_completion, send_batch_completion_emails, send_notification_emails) têm **zero** teste. O CI roda `pytest --cov=./` (`ci-feature.yml:39`), medindo cobertura sobre tudo — cobertura ilusória.

**Fato.** `app/tests/local/run_local.py` não é teste pytest: é um script que importa os 7 handlers e os chama com eventos mockados (ou `None`), reatribuindo `response` sem **nenhuma asserção** (`:39-118`); importa `dotenv` (`:1`) que **não está no `requirements.txt`**; e tem a última feature comentada (`send_notification_emails`, `:115-118`). Ao rodar `delete` e `get_active` com `event=None` e adapters reais, ele dispara AWS de verdade.

**Fato.** No teste que existe: nomes `test_should_*` (estilo BDD), comentários `# Arrange/# Act/# Assert`, dublês `Mock`/`@patch`. Ele cobre as 4 camadas (entidade, adapter, use-case, handler) da sua feature com competência real — inclusive a normalização de nome da entidade (`test_should_normalize_...`, `:149`).

**Interpretação.** A docstring do arquivo se descreve como "comprehensive unit tests for all layers ... following Clean Architecture" (`:4-6`) — verdadeiro para uma feature, falso para o app. A feature testada é, ironia, a de arquitetura mais invertida (lógica no adapter — eixo 3/4), então os testes cimentam essa forma. Relógio não é injetável (`DateAndTimeUtils` é util estático), então o caminho de conclusão de batch (que lê o relógio) não é testável de forma determinística — e não é testado.

## 16. Régua de qualidade (linters, tipagem, CI)

**Fato.** CI (`.github/workflows/ci-feature.yml`) roda em `feature/**`: `pylint --rcfile=.pylintrc app`, `pytest --cov`, upload Codecov, e `terraform validate`; no verde, abre PR para `main` automaticamente. `pylint` com `fail-under=10` (`.pylintrc:56`) e `max-line-length=105` (`:362`). Python 3.13.

**Fato — o mypy foi removido.** Commit `c1b158c "chore: removing mypy step"` apaga 4 linhas do `ci-feature.yml`. Hoje não há **nenhum** checador de tipos. Não há formatador (black/ruff). Não há **import-linter** — logo a fronteira Hexagonal (domínio não importa infra) é **não-forçada**, o que explica o `import awswrangler` num use-case (eixo 7).

**Fato — o pylint está configurado para calar o que pega os problemas reais.** O bloco `disable=` do `.pylintrc:2-16` desliga, entre outros:
- `R0801` duplicate-code — por isso a duplicação de boto3 (STS/região) espalhada em 5+ sítios e as duas slices gêmeas de e-mail passam invisíveis.
- `W0102` dangerous-default-value — por isso o default de região no import (`aws_client.py:10`) e o `headers=DEFAULT_HEADERS` (`http_response_mapper.py:22`) nunca são apontados.
- `W0613` unused-argument, `W1203` logging-fstring-interpolation, `C0114/C0115/C0116` docstrings.

Somam-se `# pylint: disable` inline: `no-member` no `ExceptionInfo` quebrado (`:39`), `too-many-return-statements` no mapper (`:66`) e `too-many-locals,too-many-branches,too-many-statements` no parser (`fundamentus_html_parser_adapter.py:153`).

**Interpretação.** `fail-under=10` *parece* rigor máximo, mas num pacote de ~4.800 linhas um punhado de avisos arredonda para 10,00/10 e passa — foi o que deixou o `import awswrangler` morto sobreviver. A régua tem a forma de rigor e o efeito de complacência. Contraste direto com o LUC (`pyright` strict + `import-linter` + `ruff`): lá a fronteira é máquina; aqui é convenção não-verificada. Detalhe simbólico: existe um helper `AWSClient.get_caller_account_id()` no kernel (`cross/utils/aws_client.py:25`), mas ele é usado em **uma** slice (`send_notification_emails`); as demais reescrevem `boto3.client("sts").get_caller_identity()["Account"]` inline (`get_active_stocks/.../sns_topic_adapter.py:35`, `check_batch_processes_completion/.../sns_topic_adapter.py:34`, `store_dynamodb_streams_data/.../awswrangler_cdc_data_catalog_sync_adapter.py:45`, `send_batch_completion_emails/.../sns_event_lambda_mapper.py:36`) — e `R0801` desligado torna essa deriva invisível.

## 17. Estilo

**Fato.** Estrutura e docstrings em inglês (Google-style, detalhadas e abundantes — ex. o docstring de 60+ atributos em `fundamentus_stock_metrics.py`). Campos de domínio em **pt-BR** casando com o site fonte: `nome_papel`, `vlr_cot`, `vlr_p_sobre_l`, `vlr_div_yield` (`fundamentus_stock_metrics.py:19+`). Type hints presentes mas frouxos (`dict[str, Any]`, `list` sem parâmetro, `Optional` omitido). Ternário redundante: `return True if x in y else False` (`awsrangler_data_catalog_adapter.py:57`). Entidades com comportamento real de normalização no `__post_init__` (`stock.py:31-33` strip/upper; `table.py:39-41` strip/lower).

**Fato — deriva de nomenclatura.** A feature `send_batch_completion_emails` tem o arquivo `send_batch_processes_emails_use_case.py` e a classe `SendBatchCompletionEMailsUseCase` (grafia `EMails`). Três nomes para a mesma coisa.

**Força.** Legibilidade alta, docstrings caprichadas, entidades não-anêmicas (normalizam e são ricas o suficiente).

**Fraqueza.** Entidades são `@dataclass` **mutáveis** (não frozen) e se auto-carimbam com relógio via `field(default_factory=lambda: DateAndTimeUtils.now(...))` (`batch_process.py:18-35`, `stock.py:18-29`) — construir a entidade toca o relógio real, o que prejudica determinismo em teste. `finished_at: datetime = None` (`batch_process.py:36`) é `Optional` sem anotação `Optional` — deriva de tipo que, sem checador, não incomoda.

## 18. Observabilidade

**Fato.** Logger por módulo via `LogUtils.setup_logger` (`cross/utils/log.py:10`), mas ele **adiciona um `StreamHandler` a cada chamada** sem checar handler existente (`:26-32`) e faz `propagate = False` (`:23`). Decorador `timing_decorator` (`cross/utils/decorators.py`) aplicado a poucos métodos de infra (só em `get_active_stocks` e no repo de `get_fundamentus`). `log_loop_status` dá progresso em laços. Logging f-string eager, com casos de logar o payload inteiro: `f"...{input_dto}"` (`store_dynamodb_streams_data_use_case.py:165`).

**Fraqueza.** Sem logging estruturado (JSON), sem correlation/trace id, sem métricas/tracing (nada de X-Ray/EMF) — em Lambda, `propagate=False` + handler próprio ainda descarta a formatação do runtime. O `addHandler` sem dedup arrisca linhas duplicadas se um logger de mesmo nome for reconfigurado. `timing_decorator` inconsistente (instrumenta parte da infra, ignora o resto) dá observabilidade em manchas. Logar `input_dto` cru pode vazar volume/PII nos logs.

**Força.** Há uma intenção de observabilidade (timing, progresso de laço, formatter com timestamp/nível) e o padrão de logger por `__name__` é são.

---

## Bugs concretos (a prova de que o ritual não garante)

Estes não são questões de gosto — são defeitos que a cerimônia Hexagonal/ABC deveria ter prevenido e não preveniu, e que a régua deixou passar:

1. **`RequestsHTTPClientAdapter.get` estoura `UnboundLocalError` em timeout.** Os `except Timeout/ConnectionError/HTTPError` só logam, não dão `return` nem `raise` (`cross/infra/adapters/requests_http_client_adapter.py:53-69`); a execução cai no `return HTTPClientResponse(url=r.url, ...)` (`:71-72`) onde `r` só existe se o `try` teve sucesso. Em qualquer timeout real, engole o erro verdadeiro e lança um `UnboundLocalError` confuso. É o adapter compartilhado por 2 features de scraping.

2. **E-mail de conclusão sai com `{{placeholders}}` crus.** O use-case chama `send_email(email_setup=..., placeholders=email_placeholders)` **sem** `replace_placeholders=True` (`send_batch_processes_emails_use_case.py:87-90`); o adapter só substitui se `if replace_placeholders and placeholders` (`ses_mail_service_adapter.py:55`), que é `False` por default. Resultado: a substituição nunca roda e o corpo vai com os marcadores literais. O desenho do port por flag booleana *causou* o bug; nenhum teste cobre essa feature.

3. **`ExceptionInfo` é dead code comprovadamente quebrado.** `to_template_dict` referencia 5 atributos inexistentes (`exception_info.py:47,52,54,55,61`); silenciado por `# pylint: disable=no-member` (`:39`); classe sem nenhum uso.

4. **Falhas de entrada vazia.** `check_batch_processes_completion_use_case.py:82` (NameError), `store_dynamodb_streams_data_use_case.py:171` (IndexError) e `get_active_stocks/.../dynamodb_database_repository.py:77` (o `except` referencia `stock`, indefinido se a lista for vazia).

5. **Sobra `"execution_time": "teste"`** em produção (`send_batch_processes_emails_use_case.py:85`).

6. **Dependência declarada e não usada / não declarada e usada.** `PyYAML` está no `requirements.txt` mas não é importado em `app/src` (o README fala de parsing de portfólio YAML, feature ausente do src atual); `dotenv` é usado em `run_local.py:1` e **não** está no `requirements.txt`.

---

## Síntese: forças e fraquezas lado a lado

| Eixo | Força real | Fraqueza real |
|---|---|---|
| Contrato (ABC) | Uniforme; garante nomes de método na instanciação | Só nominal; assinatura/tipo não verificados |
| Onde moram | Localidade por slice é excelente | Colisão de nomes; fachada inconsistente (VO sim, entidade não) |
| Granularidade | ISP honrado na maioria (ports de 1 método) | `IDataCatalogAdapter` gordo (5 métodos p/ 1 usado) |
| Adapter×contrato | 100% herdam o ABC (autoimagem procede) | Deriva de assinatura invisível (sem mypy) |
| Fakes | — | Não há fakes; `Mock(spec=concreto)` + `@patch(lib)` caixa-branca |
| DI/composition | Explícito, uniforme, sem container | I/O (STS) no import; instanciação não-testável |
| Use-case | Curto, linear, legível | `os.getenv`/URL/`datetime.now`/`import awswrangler` no core |
| DTO/validação | DTOs simples e claros | Zero validação; coerção silenciosa; `Decimal→float` |
| Topologia | Serverless coerente + Terraform | Resposta HTTP para gatilho não-HTTP |
| Kernel | `BatchProcess`/HTTP genuinamente compartilhados | `cross` gordo com infra concreta dentro |
| Erro | — | Sem exceções de domínio; caminho `fail`→status morto; `ExceptionInfo` quebrado |
| Config | Checagem de presença por handler | Sem Settings central; default perigoso no import |
| Async | Síncrono é adequado a Lambda | Loop de scraping serial (teto de throughput) |
| Transações | `.add()` atômico no contador | Read-then-write sem condição; regra de conclusão na infra |
| Testes | A 1 feature testada é bem testada | 6/7 sem teste; cobertura ilusória; `run_local` não asserta |
| Régua | CI existe (pylint+pytest+terraform) | mypy removido; sem import-linter; pylint cala os checks úteis |
| Estilo | Docstrings caprichadas; entidades ricas | Entidades mutáveis que tocam relógio; deriva de nomes |
| Observabilidade | Intenção presente (timing, progresso) | Sem estrutura/trace; `addHandler` sem dedup; timing em manchas |

## Leitura para o padrão do LUC

O b3stocks é um bom **mapa da forma** do padrão familiar do dono — a topologia vertical-slice + ports ABC + composition root no handler é limpa, uniforme e fácil de navegar, e vale como molde de organização. O que ele demonstra por ausência é que **a forma Hexagonal não entrega garantia sem uma régua que a force**: sem checador de tipos e sem import-linter, o `import awswrangler` no core, o `Optional` que some entre port e adapter, a regra de domínio que escorrega para o repositório e o `ExceptionInfo` quebrado convivem em paz com um CI verde. É precisamente o inverso da postura do `apps/api` do LUC (pyright strict, import-linter, fakes em vez de mocks, `Clock` injetado, sem env no core, dinheiro em inteiro) — e a comparação sugere que o valor do padrão do LUC não está na nomenclatura Clean/Hexagonal, e sim nas travas de máquina que o b3stocks optou por não ter (e, no caso do mypy, por remover).
