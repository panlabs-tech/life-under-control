# Mecanismos de contrato em Python — o que cada um garante de fato (#223)

Research do mapa wayfinder #219. Pergunta: sob as versões pinadas do `apps/api` (Python 3.14, pyright strict), o que cada mecanismo de contrato **garante de fato** — não o que a intuição promete. Comparo quatro: `typing.Protocol` estrutural (PEP 544), ABC nominal (PEP 3119 / `abc`), híbrido (o adapter herda explicitamente o Protocol) e classe plana com override por convenção.

Todo claim de comportamento aqui foi verificado por experimento nesta toolchain e a saída está reproduzida no Apêndice A. Todo claim normativo aponta pra fonte primária (PEP, spec de typing, docs de `abc`, docs do pyright). Onde há opinião minha, está rotulada **opinião**.

## Versões exatas (medidas)

- CPython **3.14.4** (`uv run python -V` → `Python 3.14.4`), interpretador gerido pelo uv.
- pyright **1.1.411** (`uv run pyright --version` → `pyright 1.1.411`) — o repo pina `pyright>=1.1.390`.
- `typing_extensions` **4.16.0** (resolvido pelo `uv sync`).
- Modo do checker: `typeCheckingMode = "strict"`, `pythonVersion = "3.14"` — os mesmos de `apps/api/pyproject.toml`. O harness de experimento usou um `pyrightconfig.json` com exatamente `{"typeCheckingMode":"strict","pythonVersion":"3.14"}` apontando pro mesmo `.venv`.

Método de execução: arquivos de experimento fora do worktree (`/tmp/contract-exp/`), checados com `.venv/bin/pyright <arquivo>` e executados com `.venv/bin/python <arquivo>`. Os scripts **não** foram commitados; só este relatório.

## Aterramento no repo

O `apps/api` já escolheu na prática um dos quatro mecanismos: **todo port é um `typing.Protocol`** (em `application/`) e **todo adapter/fake é classe plana que adere estruturalmente** — não herda o Protocol. Confirmado por varredura: 15+ Protocols em `src/`, zero `abc`/`ABC`/`abstractmethod` de domínio, zero `runtime_checkable`. Exemplos: `luc_api.shared.application.clock.Clock` (Protocol) com `FixedClock` plano ao lado; `luc_api.finance.application.payment_repo.PaymentRepo` (Protocol) com `FakePaymentRepo` plano; o adapter real `SqlWhatsappEventRepo` é classe plana, sem herança.

O ponto onde a conformidade é de fato validada pelo pyright é explicitado pelo próprio docstring do composition root (`luc_api.composition`): *"The annotated return type is where pyright validates the adapter's structural adherence to the port (ADR-0014)."* Ou seja, o repo já opera com a consciência de que, no mecanismo estrutural, **o erro não nasce na definição do adapter — nasce na fábrica `provide_*` que anota o retorno como o port**. Este relatório mede o que exatamente isso implica, e o que os outros três mecanismos mudariam.

## TL;DR — matriz de garantias

| Dimensão | `Protocol` estrutural | ABC nominal | Híbrido (herda o Protocol) | Classe plana + convenção |
|---|---|---|---|---|
| Modelo de subtipagem | estrutural (implícito) | nominal (herança ou `register`) | estrutural **+** declaração explícita | nenhum contrato (herança concreta) |
| Onde o pyright acusa não-conformidade | **ponto de uso/injeção** | **instanciação** | **definição** (assinatura) + **instanciação** (membro faltante) | **não acusa** |
| Regra pyright que dispara | `reportArgumentType` / `reportReturnType` | `reportAbstractUsage` | `reportIncompatibleMethodOverride` + `reportAbstractUsage` | — |
| Membro faltante detectado (estático) | no uso do port | na instanciação | na instanciação | nunca |
| Assinatura incompatível detectada (estático) | no uso do port | na definição do override | na definição do override | só se herdar um tipo-base com aquele método |
| Instanciar a interface "pura" | `TypeError` "Protocols cannot be instantiated" | `TypeError` (abstratos não implementados) | n/a (o híbrido é a subclasse concreta) | n/a |
| Instanciar impl **incompleta** em runtime | **permitido**; `AttributeError` só ao chamar o método ausente | **bloqueado** (`TypeError` na instanciação) | bloqueado só com `@abstractmethod`; senão vira **no-op que devolve `None`** | **permitido**; falha no corpo (ex. `NotImplementedError`) ao chamar |
| `isinstance` | só com `@runtime_checkable`; **checa presença, não assinatura** | nativo (MRO / `register` / `__subclasshook__`) | nativo (é subclasse real) | trivial (herança concreta) |
| `register()` / `__subclasshook__` | não se aplica | sim — runtime, **invisível ao pyright** | não se aplica | não se aplica |
| Herda corpo default / docstring do contrato | **não** (impl estrutural é outra classe) | sim | sim | sim |
| `__init_subclass__` dispara na impl | **não** (impl não é subclasse) | sim | sim | sim |

Leitura de uma linha: o eixo que separa tudo é **onde a não-conformidade aparece**. Protocol estrutural empurra a detecção pro ponto de injeção; ABC e híbrido puxam pra mais perto da definição/instanciação; convenção não detecta nada em tempo de tipo. Em runtime, só ABC (e Protocol-com-`@abstractmethod`) travam a instanciação incompleta; Protocol puro e convenção deixam o objeto meio-construído passar até a chamada.

---

## Mecanismo 1 — `typing.Protocol` estrutural (o padrão do repo)

Subtipagem **estrutural**: uma classe é subtipo do Protocol se tiver os membros com assinatura compatível, sem herdar nada. PEP 544: *"allowing `Bucket` to be implicitly considered a subtype of both `Sized` and `Iterable[int]` by static type checkers using structural subtyping"* e *"if one defines a class `Resource` with a `close()` method that has a compatible signature, it would implicitly be a subtype of `SupportsClose`"* ([PEP 544, Rationale / Defining a protocol](https://peps.python.org/pep-0544/)).

### (a) Type-check time — quando e onde o pyright strict acusa

**A definição do adapter não-conforme é silenciosa.** No experimento exp1, `class BadAdapter` (sem `delete`, e `create` devolvendo `int` em vez de `str`) **não gera nenhum diagnóstico na sua própria definição**. O erro só aparece em dois lugares: na fábrica que anota o retorno como o port, e no call-site que passa o adapter onde o port é esperado:

```
exp1_protocol_where.py:36:12 - error: Type "BadAdapter" is not assignable to return type "Repo"
    "BadAdapter" is incompatible with protocol "Repo"
      "delete" is not present
        "create" is an incompatible type
          Type "(x: int) -> int" is not assignable to type "(x: int) -> str"
            Function return type "int" is incompatible with type "str" (reportReturnType)
exp1_protocol_where.py:40:5 - error: Argument of type "BadAdapter" cannot be assigned to parameter "repo" of type "Repo" in function "use"
      "delete" is not present
        "create" is an incompatible type ... (reportArgumentType)
```

Consequência prática: se um adapter estrutural **nunca** é passado por nenhum ponto tipado como o port (ex.: só é instanciado e usado direto), o pyright **jamais** cobra conformidade. No LUC isso é mitigado justamente pela fábrica `provide_*` anotada — é ela que força a checagem. A regra que dispara é `reportReturnType` no retorno e `reportArgumentType` no argumento; ambas são `error` já em modo `basic` ([pyright configuration](https://microsoft.github.io/pyright/#/configuration)).

**Qualidade da mensagem: alta.** O pyright enumera todos os desvios de uma vez — lista membro ausente (`"delete" is not present`) *e* método incompatível, aninhando até a causa raiz (`return type "int" is incompatible with type "str"`). Não pára no primeiro erro.

**Variância / assinaturas (exp2).** A tabela que o strict aplica, medida:

- Retorno **covariante**: `-> bool` onde o port pede `-> int` passa (bool <: int); `-> str` onde pede `-> int` falha — `reportArgumentType`, *"Function return type 'str' is incompatible with type 'int'"*.
- Parâmetro **contravariante**: `(x: object)` onde o port pede `(x: int)` passa (object é mais largo); `(x: str)` falha — *"Parameter 1: type 'int' is incompatible with type 'str'"*.
- **Parâmetro extra obrigatório**: falha — *"Extra parameter 'y'"*.
- **`async` onde se espera síncrono**: falha, e a mensagem é reveladora — o método `async def m` tem tipo `(x: int) -> CoroutineType[Any, Any, int]`, *"not assignable to (x: int) -> int"*. Ou seja, o mismatch async/sync é pego como incompatibilidade de tipo de retorno, não como categoria especial.

### (b) Runtime — o que o Python garante (pouco)

- **Instanciar o Protocol é proibido**: `P()` → `TypeError: Protocols cannot be instantiated` (exp3). PEP 544: *"Protocols cannot be instantiated, so there are no values whose runtime type is a protocol."*
- **`isinstance` exige opt-in**: sem `@runtime_checkable`, `isinstance(obj, P)` → `TypeError: Instance and class checks can only be used with @runtime_checkable protocols` (exp3). PEP 544: *"The default semantics is that `isinstance()` and `issubclass()` fail for protocol types."*
- **`@runtime_checkable` checa só presença de nome, não a assinatura** — a pegadinha central. Em exp3, `class TrickyNonCallable: m = 5` (atributo `m` que é um inteiro, nem callable) passa em `isinstance(TrickyNonCallable(), RCP)` → **`True`**. PEP 544 diz explicitamente que a checagem equivale a *"a simpler way to write `hasattr(x, '__iter__')`"* — presença, não tipo. Corolário: `isinstance` contra um Protocol **não prova** que o objeto realmente satisfaz o contrato.
- **Data protocols** (algum membro não-método): a checagem em runtime é por `hasattr` do atributo (comportamento ≥3.12). Em exp3, `DataP` com `value: int` dá `isinstance(HasValue(), DataP) → True` (o `__init__` setou `self.value`) e `isinstance(NoValue(), DataP) → False`. Mas **`issubclass` contra data protocol é proibido**: `issubclass(HasValue, DataP)` → `TypeError: Protocols with non-method members don't support issubclass(). Non-method members: 'value'.` ([typing spec, protocol](https://typing.python.org/en/latest/spec/protocol.html): *"`issubclass()` can be used only with non-data protocols"*).
- **Instanciar uma impl estrutural incompleta é permitido, e o buraco só aparece na chamada** (exp3): `class Incomplete` (tem `create`, não tem `delete`) instancia sem erro, `create(1)` funciona, e só `inc.delete(1)` estoura `AttributeError: 'Incomplete' object has no attribute 'delete'`. **O Protocol não coloca nenhuma guarda de runtime na construção do objeto.**
- **Custo de `isinstance` runtime_checkable** (exp10): contra um Protocol de 3 métodos, ~**1.6×** um `isinstance` nominal (0.138s vs 0.088s / 1M chamadas, warm cache; estável em duas execuções). Modesto graças ao cache de membros do `_ProtocolMeta` (≥3.12), mas a primeira checagem por tipo faz o loop de `hasattr` — não é grátis em caminho quente com muitos tipos distintos.

### (c) Ergonomia

- **A não-conformidade só é descoberta no fluxo de trabalho quando o adapter encontra um ponto tipado como o port** (fábrica `provide_*`, parâmetro de use-case). Escrever o adapter isolado e rodar o pyright sobre o arquivo dele **não** acusa nada.
- **Default methods (corpo concreto no Protocol) NÃO são herdados por implementadores estruturais** — porque a impl estrutural é outra classe, não subclasse. Pior: o membro com corpo default **continua obrigatório** pra impl estrutural. Em exp8, `WithDefault.helper` tem corpo, mas `StructuralNoHelper` (só define `required`) **falha** no pyright: *"`helper` is not present (reportArgumentType)"*. PEP 544: *"The default implementations cannot be used if the subtype relationship is implicit and only via structural subtyping."*
- **Docstrings não são herdadas** pela impl estrutural (exp8 runtime): `StructuralWithHelper.helper.__doc__ → None`. Cada adapter reescreve as próprias docstrings — que é exatamente o que os fakes/adapters do LUC fazem hoje.
- **Herança múltipla estrutural é trivial**: implementar dois Protocols é só ter os membros dos dois; nem precisa mencionar os Protocols.

---

## Mecanismo 2 — ABC nominal (`abc.ABC` + `@abstractmethod`)

Subtipagem **nominal**: só é subtipo quem herda o ABC (ou é registrado via `register`). Uma classe com a mesma forma, mas sem herança, **não** é aceita. PEP 3119 fundou os ABCs justamente como alternativa opt-in ao duck typing.

### (a) Type-check time

- **A subclasse incompleta é silenciosa na definição; o erro nasce na instanciação** (exp4b): `class IncompleteSub(Repo)` que esquece `delete` **não** gera erro na linha da definição. O pyright acusa só quando alguém escreve `IncompleteSub()`:

```
exp4b_abc_noignore.py:19:5 - error: Cannot instantiate abstract class "Repo"
    "Repo.create" is not implemented
    "Repo.delete" is not implemented (reportAbstractUsage)
exp4b_abc_noignore.py:20:5 - error: Cannot instantiate abstract class "IncompleteSub"
    "Repo.delete" is not implemented (reportAbstractUsage)
```

A regra é `reportAbstractUsage` — *"the attempted instantiate an abstract or protocol class or use of an abstract method"* — e é `error` tanto em `basic` quanto em `strict`.
- **Match estrutural é rejeitado** (exp5): `class Structural` com a mesma forma, sem herdar `Repo`, falha ao ser passada onde `Repo` é esperado: *"Argument of type 'Structural' cannot be assigned to parameter 'r' of type 'Repo' ... 'Structural' is not assignable to 'Repo' (reportArgumentType)"*. Repare que a mensagem é **mais pobre** que a do Protocol: como o critério é nominal, o pyright não faz o detalhamento membro-a-membro — só diz "não é subtipo".
- **Assinatura incompatível no override** é pega na **definição** (via `reportIncompatibleMethodOverride`, como no híbrido — ver abaixo), não só na instanciação.
- **`isinstance` nominal é estaticamente conhecido**: em exp4, `isinstance(Complete(), Repo)` gera `reportUnnecessaryIsInstance` (*"Complete is always an instance of Repo"*) — o checker **sabe** que é sempre verdadeiro. (Essa regra é `none` em basic e `error` em strict.)

### (b) Runtime — aqui o ABC ganha dentes

- **Instanciar o ABC ou qualquer subclasse incompleta estoura na construção**, com mensagem que nomeia os métodos faltantes (exp4): `Repo()` → `TypeError: Can't instantiate abstract class Repo without an implementation for abstract methods 'create', 'delete'`; `IncompleteSub()` → `TypeError: ... abstract method 'delete'`. Docs de `abc`: *"A class that has a metaclass derived from `ABCMeta` cannot be instantiated unless all of its abstract methods and properties are overridden."* Este é o contraste-chave com o Protocol: o ABC **impede em runtime** o objeto meio-construído de existir.
- **`isinstance`/`issubclass` funcionam nativamente** (sem `@runtime_checkable`), via MRO.
- **`register()` cria subclasse virtual — em runtime** (exp5): após `Repo.register(Structural)`, `isinstance(Structural(), Repo) → True` e `issubclass(Structural, Repo) → True`. **Mas o pyright não enxerga `register()`**: ele continua rejeitando `want(Structural())` estaticamente. Divergência dura entre o que roda e o que type-checa. Docs de `abc` inclusive alertam que o ABC registrado *"won't show up in their MRO nor will method implementations defined by the registering ABC be callable"*.
- **`__subclasshook__`** permite ao ABC emular checagem estrutural em runtime (exp9): um `DuckBase` cujo `__subclasshook__` retorna `hasattr(other, "quack")` faz `isinstance(Duck(), DuckBase) → True` e `isinstance(Dog(), DuckBase) → False`, sem herança nem `register`. PEP 3119 / docs de `abc`: *"you can customize the behavior of `issubclass()` further without the need to call `register()`"*. De novo: invisível ao pyright.
- **`__init_subclass__` dispara em toda subclasse real** (exp9): registrou `['Child', 'GrandChild']`. Hook de que o mecanismo estrutural **não** dispõe (impl estrutural nunca é subclasse).

### (c) Ergonomia

- **A não-conformidade é descoberta cedo em runtime** — no primeiro `AdapterConcreto()`, que num teste/boot acontece logo. Mensagem de erro nomeia o método faltante. Estaticamente, porém, ainda é a instanciação (não a definição) que acusa.
- **Default methods e docstrings SÃO herdados** (é herança de verdade): um método não-abstrato do ABC vira comportamento compartilhado, e docstrings de métodos abstratos são herdadas pela subclasse que sobrescreve **só se ela não redefinir o `__doc__`**.
- **Herança múltipla** de ABCs funciona, mas colide com o metaclass: misturar um ABC com outra classe de metaclass incompatível dá `TypeError` de metaclass. Com Protocols isso não acontece (o implementador estrutural não herda nada).
- **Acoplamento**: o adapter passa a depender de importar o ABC do módulo do contrato — herança nominal amarra o pacote do adapter ao pacote do port. No modelo estrutural do LUC, o adapter não importa o port.

---

## Mecanismo 3 — Híbrido (o adapter herda explicitamente o Protocol)

`class Adapter(MeuProtocol): ...`. PEP 544 permite: *"To explicitly declare that a certain class implements a given protocol, it can be used as a regular base class."* É estrutural para quem consome + declaração explícita para quem implementa.

### (a) Type-check time — a detecção mais precoce dos quatro

Este é o único mecanismo em que a assinatura incompatível é acusada **na própria definição do adapter** (exp6):

```
exp6_hybrid.py:23:9 - error: Method "create" overrides class "Repo" in an incompatible manner
    Return type mismatch: base method returns type "str", override returns type "int"
      "int" is not assignable to "str" (reportIncompatibleMethodOverride)
exp6_hybrid.py:43:9 - error: Cannot instantiate abstract class "BadHybrid"
    "Repo.delete" is not implemented (reportAbstractUsage)
```

Dois diagnósticos, dois momentos: **assinatura incompatível → na definição** (`reportIncompatibleMethodOverride`, linha do `def create`), **membro faltante → na instanciação** (`reportAbstractUsage`, tratando o membro do Protocol não sobrescrito como abstrato). O typing spec confirma a direção: ao herdar o Protocol, *"a type checker verifies that the class actually implements the protocol correctly"*, e membros não implementados fazem a classe ser tratada como abstrata (*"all of them must be implemented by an explicit subclass before it can be instantiated"*).

**Nuance crítica de modo:** `reportIncompatibleMethodOverride` é `none` em `basic` e só vira `error` em `strict` ([pyright configuration](https://microsoft.github.io/pyright/#/configuration)). Ou seja, **o ganho "erro na definição" do híbrido só existe porque o LUC roda strict**. Em basic, o híbrido perderia a detecção precoce de assinatura e cairia de volta no perfil "só acusa no uso/instanciação".

### (b) Runtime — o buraco que sobrevive

- **O híbrido concreto instancia normalmente**: `GoodHybrid().create(1) → 1` (exp6).
- **Mas o membro do Protocol com corpo `...`, quando não sobrescrito, vira um no-op concreto que devolve `None` — NÃO é abstrato em runtime** (exp6): `BadHybrid().delete(1) → None`, sem `AttributeError`, sem `TypeError`. Isto é uma **divergência pyright × runtime**: o pyright recusa instanciar `BadHybrid` (chamou de abstrata), mas o CPython instancia e o método herdado do corpo `...` só retorna `None`. Quem burlar os tipos embarca um adapter que silenciosamente responde `None`.
- **`@abstractmethod` restaura os dentes de runtime** (exp6): um Protocol com `@abstractmethod def op` faz a subclasse que não implementa (`ForgotOp`) estourar `TypeError: Can't instantiate abstract class ForgotOp without an implementation for abstract method 'op'`. PEP 544: *"All methods defined in the protocol class body are protocol members, both normal and decorated with `@abstractmethod`."* É o caminho para ter, num Protocol, a mesma trava de instanciação de um ABC — só nos membros que você marcar.

### (c) Ergonomia

- **Detecção mais próxima da definição** — bom pra quem escreve o adapter e roda o pyright só sobre ele; o erro aparece sem precisar de call-site.
- **Herda default bodies e docstrings do Protocol** (por ser subclasse de verdade) — em exp8, `SubImpl` (herda `WithDefault`) devolve `helper() → "default"` e `SubImpl.helper.__doc__ → "Default helper docstring (lives on the Protocol)."`. É a diferença ergonômica frente ao estrutural, que não herda nem corpo nem docstring.
- **`__init_subclass__` dispara** (é subclasse) — habilita auto-registro do adapter, se algum dia útil.
- **Custo**: reintroduz o acoplamento de import (o adapter importa o port) e o risco de colisão de metaclass em herança múltipla — os mesmos custos do ABC. Some-se a divergência do corpo-`...`-vira-`None` acima, que é uma armadilha silenciosa não presente no estrutural puro (lá o método simplesmente não existe e estoura `AttributeError`, um sinal mais barulhento).

---

## Mecanismo 4 — Classe plana + override por convenção

Sem Protocol e sem ABC: uma classe-base concreta (por vezes com `raise NotImplementedError`), e subclasses que se espera sobrescreverem "por combinado". É o caso-controle: quanto contrato existe quando não se declara nenhum.

### (a) Type-check time — nada

Em exp7, o pyright reporta **0 erros**. `class Rogue(Base)` com `def craete` (typo de `create`) passa incólume: pro checker, `Rogue` **é** um `Base` (só adicionou um método a mais e herdou `create`). O typo não é um override que falha — é simplesmente um método novo. Nenhum ponto do fluxo estático cobra que `Rogue` de fato sobrescreveu algo. Assinatura só seria checada se a base declarasse o método com um tipo e a subclasse o sobrescrevesse de forma incompatível (aí `reportIncompatibleMethodOverride`) — mas "esquecer de sobrescrever" ou "errar o nome" é invisível.

### (b) Runtime — falha tardia, no caminho de execução

`Rogue().create(1)` executa o `Base.create`, que `raise NotImplementedError` — mas só **quando aquela linha roda** (exp7). Se o caminho não for exercido, o defeito dorme. Não há trava de instanciação (o objeto se constrói), diferente do ABC.

### (c) Ergonomia

- **A não-conformidade é descoberta o mais tarde possível**: em runtime, e só no caminho executado. É o pior perfil de descoberta dos quatro.
- **Herda tudo** (corpo, docstring) — é herança concreta comum.
- Sem qualquer sinal (estático ou de instanciação) de que um método deveria ter sido provido. **Opinião:** é o mecanismo a evitar para ports; existe aqui só como baseline. O `NotImplementedError` é um contrato "de papel" — documenta a intenção, mas nenhum checker o faz cumprir.

---

## Síntese por eixo (as perguntas do ticket, respondidas)

**Quando o pyright strict acusa (definição do adapter × ponto de uso/injeção):**

- Protocol estrutural → **só no ponto de uso/injeção** (retorno da fábrica, argumento do use-case). A definição do adapter é muda.
- ABC nominal → **na instanciação** do adapter; a definição da subclasse incompleta é muda (mas o override de assinatura incompatível é pego na definição).
- Híbrido → **o mais cedo**: assinatura na definição, membro faltante na instanciação. Depende de strict pra pegar assinatura.
- Convenção → **nunca**.

**Qualidade da mensagem:** Protocol e híbrido dão o detalhamento membro-a-membro mais rico (listam ausências e incompatibilidades aninhadas até a raiz). ABC nominal, quando recusa um match estrutural, dá só *"X is not assignable to Y"* — mais pobre, porque o critério é "é subclasse?", não "quais membros faltam?". A trava de instanciação (ABC e híbrido) nomeia os métodos faltantes.

**Variância/assinaturas:** idênticas nos três que checam (retorno covariante, parâmetro contravariante, parâmetro extra proibido, async≠sync pego como retorno `CoroutineType`). Só muda **onde** o diagnóstico aparece.

**Runtime — instanciação de impl incompleta:** ABC bloqueia (`TypeError` na construção); Protocol-com-`@abstractmethod` bloqueia idem; Protocol puro e convenção **não bloqueiam** (o objeto nasce; falha só ao chamar — `AttributeError` no estrutural, `NotImplementedError`/no-op-`None` conforme o caso).

**`isinstance`/`runtime_checkable` e pegadinhas:** exige `@runtime_checkable`; checa **só presença de nome**, não callable nem assinatura (o `m = 5` passou); `issubclass` proibido em data protocols; custo ~1.6× um isinstance nominal (warm). ABC não precisa de opt-in e ainda expõe `register`/`__subclasshook__` — ambos **invisíveis ao pyright**, fonte de divergência runtime×estático.

**`__init_subclass__`/`__subclasshook__`:** só existem no mundo nominal/herança (ABC e híbrido). O Protocol estrutural, por não criar relação de subclasse, não dispara `__init_subclass__` no implementador nem participa de `__subclasshook__`.

**Ergonomia — default methods, docstrings, herança múltipla:** herança (ABC/híbrido) **reaproveita** corpo e docstring; estrutural **não** (cada adapter reescreve, e membros com corpo default continuam obrigatórios). Herança múltipla é trivial no estrutural (nada a herdar) e sujeita a colisão de metaclass no ABC.

## Leitura para o padrão atual do LUC (observação, não decisão)

O `apps/api` usa Protocol estrutural puro com fakes/adapters planos, e ancora a checagem nas fábricas `provide_*`. As consequências medidas deste relatório sobre esse arranjo:

- O que **garante** de fato: no ponto de injeção (fábrica/uso), o pyright strict cobra conformidade completa com mensagem rica; a variância é aplicada corretamente; o adapter fica desacoplado (não importa o port).
- O que **não** garante: (1) um adapter que nunca passa por um ponto tipado como o port fica sem checagem — a disciplina das fábricas `provide_*` é o que fecha esse buraco, e vale mantê-la como regra; (2) nenhuma trava de runtime na construção de um adapter incompleto (só `AttributeError` ao chamar) — aceitável porque o gate estático é o guarda-costas, mas significa que qualquer caminho que contorne os tipos (ex.: dados vindos de fora, `Any`) não tem rede; (3) sem reaproveitamento de docstring/corpo — daí os fakes reescreverem tudo.
- **Opinião:** para ports do LUC, se algum dia um contrato precisar de trava de runtime na instanciação (ex.: um port com muitos métodos onde esquecer um seja fácil e caro), o caminho de menor ruptura é **`@abstractmethod` dentro do Protocol** — mantém a subtipagem estrutural para os consumidores e adiciona a trava de construção só onde marcada, sem migrar para ABC nominal nem pagar o acoplamento de herança. O híbrido (herdar o Protocol) só compensa se o objetivo for detecção na definição do adapter sem call-site — mas cuidado com a armadilha do corpo `...` virando no-op `None`.

## Fontes primárias

- [PEP 544 — Protocols: Structural subtyping (static duck typing)](https://peps.python.org/pep-0544/) — subtipagem estrutural, proibição de instanciar, `@runtime_checkable`, data vs non-data protocols, default implementations só via herança explícita, merging de protocols, `@abstractmethod` em protocol.
- [PEP 3119 — Introducing Abstract Base Classes](https://peps.python.org/pep-3119/) — racional nominal, `register()`/subclasse virtual, `__subclasshook__`, `__abstractmethods__` não-vazio ⇒ `TypeError` na instanciação.
- [Typing spec — Protocols](https://typing.python.org/en/latest/spec/protocol.html) — conformance verificada ao herdar explicitamente; subclasse explícita incompleta tratada como abstrata; `isinstance` presença-só; `issubclass` só non-data; defaults só via herança explícita. (Fonte da spec: `python/typing`, `docs/spec/protocol.rst`.)
- [Documentação do módulo `abc`](https://docs.python.org/3/library/abc.html) — `ABC`/`ABCMeta`, não-instanciável sem overrides, `register`, `__subclasshook__`, nota de que o ABC registrado não entra no MRO.
- [Pyright — Configuration (diagnostic rules e defaults por modo)](https://microsoft.github.io/pyright/#/configuration) — `reportAbstractUsage` (error em basic e strict), `reportIncompatibleMethodOverride` (none em basic, **error em strict**), `reportArgumentType`/`reportReturnType` (error nos dois), `reportUnnecessaryIsInstance` (none em basic, error em strict).

---

## Apêndice A — experimentos (scripts e saídas verbatim)

Toolchain: CPython 3.14.4, pyright 1.1.411, strict. Cada bloco traz o script e a saída exata de `pyright` e/ou `python`. Os scripts viveram em `/tmp/contract-exp/` e não foram commitados.

### exp1 — Protocol estrutural: onde o erro aparece

```python
from typing import Protocol


class Repo(Protocol):
    def create(self, x: int) -> str: ...
    def delete(self, x: int) -> bool: ...


class GoodAdapter:
    def create(self, x: int) -> str:
        return str(x)

    def delete(self, x: int) -> bool:
        return True


# BadAdapter: `delete` ausente, `create` devolve int. Silencioso na definição.
class BadAdapter:
    def create(self, x: int) -> int:
        return x


def use(repo: Repo) -> None:
    _ = repo.create(1)


def provide_good() -> Repo:
    return GoodAdapter()


def provide_bad() -> Repo:
    return BadAdapter()  # erro AQUI (retorno)


use(GoodAdapter())
use(BadAdapter())  # erro AQUI (argumento)
```

`pyright exp1`:

```
exp1_protocol_where.py:36:12 - error: Type "BadAdapter" is not assignable to return type "Repo"
    "BadAdapter" is incompatible with protocol "Repo"
      "delete" is not present
        "create" is an incompatible type
          Type "(x: int) -> int" is not assignable to type "(x: int) -> str"
            Function return type "int" is incompatible with type "str" (reportReturnType)
exp1_protocol_where.py:40:5 - error: Argument of type "BadAdapter" cannot be assigned to parameter "repo" of type "Repo" in function "use"
    "BadAdapter" is incompatible with protocol "Repo"
      "delete" is not present
        "create" is an incompatible type
          Type "(x: int) -> int" is not assignable to type "(x: int) -> str"
            Function return type "int" is incompatible with type "str" (reportArgumentType)
2 errors, 0 warnings, 0 informations
```

(Nenhum diagnóstico na linha de `class BadAdapter`.)

### exp2 — Protocol estrutural: variância e assinaturas

```python
from typing import Protocol


class P(Protocol):
    def m(self, x: int) -> int: ...


class WrongReturn:
    def m(self, x: int) -> str:
        return ""


class NarrowerReturn:  # bool <: int -> OK
    def m(self, x: int) -> bool:
        return True


class WrongParamType:  # str não é >= int -> falha
    def m(self, x: str) -> int:
        return 0


class WiderParam:  # object > int -> OK
    def m(self, x: object) -> int:
        return 0


class ExtraRequiredParam:
    def m(self, x: int, y: int) -> int:
        return 0


class AsyncVsSync:
    async def m(self, x: int) -> int:
        return 0


def want(p: P) -> None: ...


want(WrongReturn())
want(NarrowerReturn())  # OK
want(WrongParamType())
want(WiderParam())  # OK
want(ExtraRequiredParam())
want(AsyncVsSync())
```

`pyright exp2` (erros nas linhas de `WrongReturn`, `WrongParamType`, `ExtraRequiredParam`, `AsyncVsSync`; `NarrowerReturn` e `WiderParam` sem erro):

```
exp2_protocol_signatures.py:43:6 - error: Argument of type "WrongReturn" ... "m" is an incompatible type
        Type "(x: int) -> str" is not assignable to type "(x: int) -> int"
          Function return type "str" is incompatible with type "int" (reportArgumentType)
exp2_protocol_signatures.py:45:6 - error: Argument of type "WrongParamType" ...
        Type "(x: str) -> int" is not assignable to type "(x: int) -> int"
          Parameter 1: type "int" is incompatible with type "str" (reportArgumentType)
exp2_protocol_signatures.py:47:6 - error: Argument of type "ExtraRequiredParam" ...
        Type "(x: int, y: int) -> int" is not assignable to type "(x: int) -> int"
          Extra parameter "y" (reportArgumentType)
exp2_protocol_signatures.py:48:6 - error: Argument of type "AsyncVsSync" ...
        Type "(x: int) -> CoroutineType[Any, Any, int]" is not assignable to type "(x: int) -> int"
          Function return type "CoroutineType[Any, Any, int]" is incompatible with type "int" (reportArgumentType)
4 errors, 0 warnings, 0 informations
```

### exp3 — Protocol runtime: instanciação, isinstance, incompletude

```python
from typing import Protocol, runtime_checkable


class P(Protocol):
    def m(self, x: int) -> int: ...


@runtime_checkable
class RCP(Protocol):
    def m(self, x: int) -> int: ...


@runtime_checkable
class DataP(Protocol):
    value: int


class Impl:
    def m(self, x: int) -> int:
        return x


class TrickyNonCallable:
    m = 5  # nome presente, não-callable


class HasValue:
    def __init__(self) -> None:
        self.value = 3


class NoValue:
    pass


class Incomplete:
    def create(self, x: int) -> str:
        return str(x)
    # `delete` ausente


def main() -> None:
    try:
        _ = P()  # pyright: ignore[reportAbstractUsage]
    except TypeError as e:
        print("1 instantiate Protocol P ->", type(e).__name__, "|", e)
    try:
        print("2 isinstance non-rc ->", isinstance(Impl(), P))
    except TypeError as e:
        print("2 isinstance non-rc ->", type(e).__name__, "|", e)
    print("3 isinstance(Impl, RCP) ->", isinstance(Impl(), RCP))
    print("4 isinstance(TrickyNonCallable, RCP) ->", isinstance(TrickyNonCallable(), RCP))
    print("5 isinstance(HasValue, DataP) ->", isinstance(HasValue(), DataP))
    print("5 isinstance(NoValue, DataP) ->", isinstance(NoValue(), DataP))
    inc = Incomplete()
    print("6 Incomplete().create(1) ->", inc.create(1))
    try:
        inc.delete(1)  # pyright: ignore[reportAttributeAccessIssue]
    except AttributeError as e:
        print("6 Incomplete().delete(1) ->", type(e).__name__, "|", e)


if __name__ == "__main__":
    main()
```

`python exp3`:

```
1 instantiate Protocol P -> TypeError | Protocols cannot be instantiated
2 isinstance non-rc -> TypeError | Instance and class checks can only be used with @runtime_checkable protocols
3 isinstance(Impl, RCP) -> True
4 isinstance(TrickyNonCallable, RCP) -> True
5 isinstance(HasValue, DataP) -> True
5 isinstance(NoValue, DataP) -> False
6 Incomplete().create(1) -> 1
6 Incomplete().delete(1) -> AttributeError | 'Incomplete' object has no attribute 'delete'
```

`issubclass` contra data protocol (one-liner):

```
issubclass(HasValue, DataP) -> TypeError | Protocols with non-method members don't support issubclass(). Non-method members: 'value'.
isinstance(HasValue(), DataP) -> True
```

### exp4 / exp4b — ABC nominal

```python
from abc import ABC, abstractmethod


class Repo(ABC):
    @abstractmethod
    def create(self, x: int) -> str: ...
    @abstractmethod
    def delete(self, x: int) -> bool: ...


class Complete(Repo):
    def create(self, x: int) -> str:
        return str(x)
    def delete(self, x: int) -> bool:
        return True


class IncompleteSub(Repo):  # legal na definição
    def create(self, x: int) -> str:
        return str(x)


a = Repo()          # reportAbstractUsage
b = IncompleteSub() # reportAbstractUsage (delete)
```

`pyright exp4b`:

```
exp4b_abc_noignore.py:19:5 - error: Cannot instantiate abstract class "Repo"
    "Repo.create" is not implemented
    "Repo.delete" is not implemented (reportAbstractUsage)
exp4b_abc_noignore.py:20:5 - error: Cannot instantiate abstract class "IncompleteSub"
    "Repo.delete" is not implemented (reportAbstractUsage)
2 errors, 0 warnings, 0 informations
```

`python exp4` (runtime):

```
instantiate ABC Repo -> TypeError | Can't instantiate abstract class Repo without an implementation for abstract methods 'create', 'delete'
instantiate Complete -> <__main__.Complete object at 0x...>
instantiate IncompleteSub -> TypeError | Can't instantiate abstract class IncompleteSub without an implementation for abstract method 'delete'
isinstance(Complete, Repo) -> True
```

(No `pyright exp4`, o único diagnóstico é `reportUnnecessaryIsInstance` em `isinstance(Complete(), Repo)` — *"Complete is always an instance of Repo"* —, regra `error` só em strict.)

### exp5 — ABC nominal rejeita match estrutural; `register()` é runtime-only

```python
from abc import ABC, abstractmethod


class Repo(ABC):
    @abstractmethod
    def create(self, x: int) -> str: ...


class Structural:  # mesma forma, sem herdar Repo
    def create(self, x: int) -> str:
        return str(x)


def want(r: Repo) -> None: ...


want(Structural())  # pyright rejeita (nominal)

Repo.register(Structural)  # runtime-only


def main() -> None:
    print("isinstance after register ->", isinstance(Structural(), Repo))
    print("issubclass after register ->", issubclass(Structural, Repo))


if __name__ == "__main__":
    main()
```

`pyright exp5`:

```
exp5_abc_structural.py:19:6 - error: Argument of type "Structural" cannot be assigned to parameter "r" of type "Repo" in function "want"
    "Structural" is not assignable to "Repo" (reportArgumentType)
1 error, 0 warnings, 0 informations
```

`python exp5`:

```
isinstance after register -> True
issubclass after register -> True
```

(Isto é: o runtime aceita depois do `register`, o pyright continua recusando.)

### exp6 — Híbrido (herda o Protocol)

```python
from abc import abstractmethod
from typing import Protocol


class Repo(Protocol):
    def create(self, x: int) -> str: ...
    def delete(self, x: int) -> bool: ...


class GoodHybrid(Repo):
    def create(self, x: int) -> str:
        return str(x)
    def delete(self, x: int) -> bool:
        return True


class BadHybrid(Repo):        # erro na DEFINIÇÃO (create) + na instanciação (delete)
    def create(self, x: int) -> int:
        return x


class StrictPort(Protocol):
    @abstractmethod
    def op(self) -> int: ...


class ForgotOp(StrictPort):
    pass


def main() -> None:
    print("GoodHybrid().create(1) ->", GoodHybrid().create(1))
    b = BadHybrid()
    print("BadHybrid().delete(1) ->", repr(b.delete(1)))  # None, sem erro
    try:
        _ = ForgotOp()  # pyright: ignore[reportAbstractUsage]
    except TypeError as e:
        print("ForgotOp() ->", type(e).__name__, "|", e)


if __name__ == "__main__":
    main()
```

`pyright exp6`:

```
exp6_hybrid.py:23:9 - error: Method "create" overrides class "Repo" in an incompatible manner
    Return type mismatch: base method returns type "str", override returns type "int"
      "int" is not assignable to "str" (reportIncompatibleMethodOverride)
exp6_hybrid.py:43:9 - error: Cannot instantiate abstract class "BadHybrid"
    "Repo.delete" is not implemented (reportAbstractUsage)
2 errors, 0 warnings, 0 informations
```

`python exp6`:

```
GoodHybrid().create(1) -> 1
BadHybrid().delete(1) -> None
ForgotOp() -> TypeError | Can't instantiate abstract class ForgotOp without an implementation for abstract method 'op'
```

(Divergência: o pyright chama `BadHybrid` de abstrata e recusa `BadHybrid()`; o runtime instancia e `delete` — herdado do corpo `...` — devolve `None`. Só `@abstractmethod`, como em `ForgotOp`, trava a instanciação em runtime.)

### exp7 — Classe plana + convenção

```python
class Base:
    def create(self, x: int) -> str:
        raise NotImplementedError


class Sub(Base):
    def create(self, x: int) -> str:
        return str(x)


class Rogue(Base):
    def craete(self, x: int) -> str:  # TYPO — não é override
        return str(x)


def want_base(b: Base) -> None:
    _ = b.create(1)


want_base(Sub())
want_base(Rogue())  # pyright OK; runtime -> NotImplementedError


def main() -> None:
    print("Sub().create(1) ->", Sub().create(1))
    try:
        Rogue().create(1)
    except NotImplementedError:
        print("Rogue().create(1) -> NotImplementedError")


if __name__ == "__main__":
    main()
```

`pyright exp7`:

```
0 errors, 0 warnings, 0 informations
```

`python exp7` (o `want_base(Rogue())` no nível de módulo estoura ao rodar):

```
Traceback (most recent call last):
  ...
  File "exp7_plain.py", line 6, in create
    raise NotImplementedError
NotImplementedError
```

### exp8 — Ergonomia: default body, docstring, herança múltipla

```python
from typing import Protocol


class WithDefault(Protocol):
    def required(self, x: int) -> int: ...
    def helper(self) -> str:
        """Default helper docstring (lives on the Protocol)."""
        return "default"


class StructuralNoHelper:
    def required(self, x: int) -> int:
        return x


class StructuralWithHelper:
    def required(self, x: int) -> int:
        return x
    def helper(self) -> str:
        return "own"


class SubImpl(WithDefault):
    def required(self, x: int) -> int:
        return x


class A(Protocol):
    def a(self) -> int: ...


class B(Protocol):
    def b(self) -> int: ...


class AB(A, B, Protocol): ...


class MultiImpl(A, B):
    def a(self) -> int:
        return 1
    def b(self) -> int:
        return 2


def want_default(w: WithDefault) -> None: ...


want_default(StructuralNoHelper())   # falha: helper ausente
want_default(StructuralWithHelper())


def want_ab(x: AB) -> None: ...


want_ab(MultiImpl())


def main() -> None:
    print("SubImpl().helper() ->", SubImpl().helper())
    print("SubImpl.helper.__doc__ ->", repr(SubImpl.helper.__doc__))
    print("StructuralWithHelper.helper.__doc__ ->", repr(StructuralWithHelper.helper.__doc__))


if __name__ == "__main__":
    main()
```

`pyright exp8` (só `StructuralNoHelper` falha; `SubImpl`, `StructuralWithHelper`, `MultiImpl`/`want_ab` OK):

```
exp8_ergonomics.py:58:14 - error: Argument of type "StructuralNoHelper" cannot be assigned to parameter "w" of type "WithDefault" in function "want_default"
    "StructuralNoHelper" is incompatible with protocol "WithDefault"
      "helper" is not present (reportArgumentType)
1 error, 0 warnings, 0 informations
```

`python exp8`:

```
SubImpl().helper() -> default
SubImpl.helper.__doc__ -> 'Default helper docstring (lives on the Protocol).'
StructuralWithHelper.helper.__doc__ -> None
```

(Impl estrutural com `helper` próprio não herda a docstring do Protocol; a subclasse explícita herda corpo e docstring. Membro com corpo default continua obrigatório para a impl estrutural.)

### exp9 — `__init_subclass__` e `__subclasshook__`

```python
from abc import ABC


class Registry:
    _subs: list[str] = []
    def __init_subclass__(cls, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        Registry._subs.append(cls.__name__)


class Child(Registry): pass
class GrandChild(Child): pass


class DuckBase(ABC):
    @classmethod
    def __subclasshook__(cls, other: type) -> bool:
        if cls is DuckBase:
            return hasattr(other, "quack")
        return NotImplemented


class Duck:
    def quack(self) -> str:
        return "quack"


class Dog:
    def bark(self) -> str:
        return "woof"


def main() -> None:
    print("__init_subclass__ registered ->", Registry._subs)
    print("isinstance(Duck, DuckBase) via subclasshook ->", isinstance(Duck(), DuckBase))
    print("isinstance(Dog, DuckBase) ->", isinstance(Dog(), DuckBase))
    print("issubclass(Duck, DuckBase) ->", issubclass(Duck, DuckBase))


if __name__ == "__main__":
    main()
```

`python exp9`:

```
__init_subclass__ registered -> ['Child', 'GrandChild']
isinstance(Duck, DuckBase) via subclasshook -> True
isinstance(Dog, DuckBase) -> False
issubclass(Duck, DuckBase) -> True
```

### exp10 — custo de `isinstance` runtime_checkable

```python
import timeit
from abc import ABC
from typing import Protocol, runtime_checkable


@runtime_checkable
class RCP(Protocol):
    def a(self) -> int: ...
    def b(self) -> int: ...
    def c(self) -> int: ...


class NominalBase(ABC):
    def a(self) -> int: return 1
    def b(self) -> int: return 2
    def c(self) -> int: return 3


class ViaProtocol:
    def a(self) -> int: return 1
    def b(self) -> int: return 2
    def c(self) -> int: return 3


class ViaNominal(NominalBase): pass


def main() -> None:
    n = 1_000_000
    t_proto = timeit.timeit(lambda: isinstance(ViaProtocol(), RCP), number=n)
    t_nominal = timeit.timeit(lambda: isinstance(ViaNominal(), NominalBase), number=n)
    print(f"protocol: {t_proto:.4f}s ; nominal: {t_nominal:.4f}s ; ratio {t_proto/t_nominal:.1f}x")
```

`python exp10` (duas execuções; a versão do script instancia o objeto uma vez e reusa, medindo o cache quente):

```
isinstance vs runtime_checkable Protocol: 0.1387s / 1,000,000 calls
isinstance vs nominal ABC base:           0.0884s / 1,000,000 calls
ratio (protocol / nominal): 1.6x
-- segunda execução: 0.1354s vs 0.0850s, ratio 1.6x
```
