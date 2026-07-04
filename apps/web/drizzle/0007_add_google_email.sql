-- issue #94: vínculo auditável Pessoa ↔ e-mail Google. Coluna aditiva, nullable
-- (nula até o vínculo real ser aplicado pela operação — ADR-0004). Único: cada
-- e-mail Google casa no máximo uma Pessoa. NULLs múltiplos são permitidos pelo
-- UNIQUE do Postgres, então as duas Pessoas coexistem sem vínculo. A normalização
-- case-insensitive é garantida na escrita (a operação grava sempre em minúsculas).
ALTER TABLE "users" ADD COLUMN "google_email" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_email_unique" UNIQUE("google_email");
