// O padrão de mensagem de commit deste repo, lido pelo `commit-msg` de
// `lefthook.yml`. Conventional Commits com subject minúsculo, que é a convenção
// declarada em `AGENTS.md` -- e o mesmo formato que o squash-merge leva para a
// branch default, porque o título do PR vira a mensagem do commit que aterrissa.
//
// A extensão é `.mjs` e não `.js` de propósito: o `package.json` da raiz não
// declara `"type": "module"`, então o Node trataria um `.js` como CommonJS e
// `export default` falharia. A extensão é o que declara o módulo aqui.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // pt-BR em prosa e commits (`AGENTS.md`): a regra de caso do subject vale,
    // a de idioma não é verificável por lint e vive na convenção escrita.
    "subject-case": [2, "always", "lower-case"],
  },
};
