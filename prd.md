Да. Я бы проектировал это не как “генератор сайтов”, а как **универсальный intent-компилятор для AI-агентов**.

Рабочее название: **IntentStack**.

Суть:

> **IntentStack — декларативный язык и компилятор, где AI-агент описывает приложение через команды и семантическую схему, а компилятор генерирует frontend, backend, database schema, API и тесты под выбранный target-стек.**

Для первого MVP я бы взял такой target:

```text
Frontend: Vite + React + Tailwind CSS + daisyUI
Backend: Hono
Database: SQLite + Drizzle ORM
Compiler: Rust
DSL format v0: YAML/JSON
```

Почему именно так:

Vite подходит для быстрого frontend MVP, потому что это современный build tool с dev server и быстрым HMR. ([vitejs][1])
Hono подходит для backend MVP, потому что он маленький, быстрый, построен на Web Standards и работает на разных JavaScript runtime, включая Node.js, Bun, Deno и edge-среды. ([Hono][2])
daisyUI очень удобен для первой версии, потому что это Tailwind-плагин, framework-agnostic, не требует JS bundle и используется через CSS-классы. ([daisyUI][3])
Tailwind подходит для генерации UI, потому что это utility-first CSS framework: компилятор может предсказуемо собирать стиль из классов. ([Tailwind CSS][4])
Drizzle ORM подходит для TypeScript backend, потому что это легковесный TypeScript ORM с developer experience-фокусом. ([Drizzle ORM][5])

---

# PRD: IntentStack v0.1

## 1. Vision

Создать **AI-native fullstack compiler**, через который AI-агент строит приложение не ручным написанием кода, а декларативными командами.

Обычный подход:

```text
Пользователь → AI → React/TS/CSS/API-код → ошибки → фиксы
```

IntentStack-подход:

```text
Пользователь → AI → Intent DSL → Rust Compiler → Generated App → Verify
```

Главная идея:

**AI должен писать не код, а намерения. Код должен писать компилятор.**

---

# 2. Product positioning

## Что это такое

IntentStack — это:

```text
1. Декларативный язык приложения
2. Универсальный IR — intermediate representation
3. Rust-компилятор
4. Target adapters
5. Component/pattern registry
6. AI-agent protocol
7. Validator + verifier
```

## Что это НЕ такое

Это не просто low-code.

Low-code обычно рассчитан на человека, который кликает блоки.

IntentStack рассчитан на **AI-агента**, который:

```text
понимает задачу
→ создает intent-команды
→ получает ошибки компилятора
→ исправляет intent-команды
→ запускает проверку
```

## Главная фраза продукта

> **IntentStack lets AI agents build fullstack apps through typed declarative intent, not handwritten framework code.**

По-русски:

> **IntentStack позволяет AI-агентам создавать fullstack-приложения через типизированные декларативные намерения, а не через ручное написание кода под конкретный фреймворк.**

---

# 3. Core problem

Современный AI coding agent часто пишет код как человек:

```tsx
export function Hero() {
  return (
    <section className="...">
      ...
    </section>
  )
}
```

Проблемы:

```text
1. Много повторяющихся паттернов
2. Агент каждый раз заново решает однотипные задачи
3. Легко ломается архитектура проекта
4. Дизайн получается непоследовательным
5. Агент может забыть про API, валидацию, типы, тесты
6. Изменения идут по строкам файлов, а не по смыслу
7. Трудно переносить результат на другую библиотеку
```

IntentStack решает это через слой:

```text
semantic intent → validated IR → target-specific code
```

---

# 4. Target users

## Primary user

**AI coding agent**

Например:

```text
Claude Code
OpenAI Codex-style agent
Cursor agent
локальный агент
свой orchestration agent
```

Он должен писать:

```yaml
op: page.create
id: home
path: /
```

а не:

```tsx
// 200 строк React-кода
```

## Secondary user

**Разработчик**

Разработчик проверяет intent-файл, запускает компилятор, смотрит diff, принимает или отклоняет изменения.

## Third user

**Founder / product builder**

Человек говорит:

> Сделай landing page, форму заявок, dashboard лидов и API.

AI-agent превращает это в intent-команды.

---

# 5. First target stack

Для v0.1 берем не самый “модный”, а самый удобный для проверки стек.

```text
Target name: web_ts_minimal
Frontend: Vite + React
UI: Tailwind CSS + daisyUI
Backend: Hono
Database: SQLite
ORM: Drizzle
Validation: Zod
Testing: Vitest / Playwright later
```

## Почему не Next.js + shadcn для v0.1

Next.js + shadcn хороши, но для первой версии они сложнее:

```text
1. больше файловой магии
2. app router / server components / client components
3. shadcn требует генерации React-компонентов
4. больше edge cases
```

Для v0.1 нам нужно быстро доказать:

```text
Intent DSL → compiler → frontend + backend + db → работает
```

daisyUI проще, потому что UI можно генерировать через HTML/JSX-классы:

```tsx
<button className="btn btn-primary">Save</button>
<input className="input input-bordered" />
<div className="card bg-base-100 shadow-sm" />
```

Это идеально для compiler MVP.

---

# 6. Long-term architecture

Главное разделение:

```text
Intent DSL
  ↓
Core IR
  ↓
Domain modules
  ↓
Target adapters
  ↓
Generated code
```

## 6.1 Intent DSL

Это внешний язык, который пишет AI.

В v0.1 — YAML/JSON.

Позже можно добавить свой компактный синтаксис:

```text
page.create home path="/"
section.add home hero variant=centered
text.set home.hero.title "AI agents for business"
form.bind lead_form Lead create
```

Но сначала лучше YAML, потому что:

```text
1. легко валидировать
2. легко читать человеку
3. LLM хорошо генерирует YAML
4. можно описать JSON Schema
5. можно делать structured output
```

## 6.2 Core IR

Внутреннее представление после парсинга.

Например:

```rust
AppGraph {
  pages: Vec<PageNode>,
  entities: Vec<EntityNode>,
  actions: Vec<ActionNode>,
  bindings: Vec<BindingNode>,
  permissions: Vec<PermissionNode>,
}
```

IR не должен знать, что такое React, Hono или Drizzle.

IR знает только:

```text
страница
секция
компонент
форма
таблица
сущность
поле
действие
endpoint
permission
data binding
```

## 6.3 Target adapter

Adapter превращает IR в конкретный стек.

Например:

```text
web_ts_minimal adapter:
  Page → React route
  Form → JSX + daisyUI classes + API call
  Entity → Drizzle schema
  Action create_record → Hono POST route
  Table → React table component
```

Позже:

```text
next_shadcn adapter
vue_nuxt adapter
sveltekit adapter
rust_axum adapter
flutter adapter
tauri adapter
```

---

# 7. Product goals

## v0.1 goal

Сделать компилятор, который из одного intent-файла генерирует рабочее fullstack-приложение:

```text
landing page
navigation
hero
cards
lead form
backend API
SQLite database
admin dashboard
CRUD table
```

## Success criteria

v0.1 считается успешной, если:

```text
1. AI-agent может создать app.intent.yaml без ручного React/Backend-кода
2. compiler генерирует Vite + React frontend
3. compiler генерирует Hono backend
4. compiler генерирует Drizzle schema
5. форма на frontend отправляет данные в backend
6. backend сохраняет запись в SQLite
7. dashboard показывает записи
8. повторный запуск compiler не ломает проект
9. простое изменение intent-файла меняет только нужный результат
```

---

# 8. Non-goals for v0.1

В первую версию не надо добавлять:

```text
1. свой визуальный редактор
2. drag-and-drop builder
3. свой frontend framework
4. сложную auth-систему
5. real-time
6. payment
7. multi-tenant
8. SSR
9. mobile
10. plugin marketplace
```

Иначе проект расползется.

v0.1 должен доказать только одно:

> AI может создавать fullstack app через декларативный intent, а компилятор стабильно превращает это в рабочий код.

---

# 9. Main product concept

## 9.1 Source of truth

Главный источник правды:

```text
intent/app.intent.yaml
```

Generated code — вторичный.

Правило:

```text
Нельзя руками редактировать generated-зоны, если они помечены как managed.
```

Пример:

```text
src/generated/*
server/generated/*
db/generated/*
```

Можно оставить custom-зоны:

```text
src/custom/*
server/custom/*
```

## 9.2 Two modes

### Mode A: Full generation

Компилятор генерирует проект с нуля.

```bash
intentstack new my-app --target web_ts_minimal
intentstack build
```

### Mode B: Intent patch

AI-agent не переписывает весь intent-файл, а делает patch.

```yaml
patch:
  - op: text.set
    target: page.home.section.hero.title
    value: "Automate your sales with AI agents"
```

Команда:

```bash
intentstack apply patches/001-change-hero.yaml
```

Это очень важно. Агент должен работать маленькими безопасными шагами.

---

# 10. DSL design principles

## 10.1 Typed, not poetic

Плохо:

```yaml
make it beautiful and modern with smooth rounded cards
```

Хорошо:

```yaml
variant: minimal
radius: md
shadow: sm
density: comfortable
```

## 10.2 Small command set first

Не надо 500 команд в v0.1.

Нужны 40–60 сильных команд, которые покрывают 80% простого fullstack.

## 10.3 Declarative over imperative

Плохо:

```yaml
create div
add class flex
add class p-4
add class rounded-lg
```

Хорошо:

```yaml
type: card
variant: elevated
padding: md
```

## 10.4 Semantic paths

AI должен менять не файл, а смысловой объект:

```yaml
target: page.home.section.hero.title
```

а не:

```yaml
file: src/App.tsx
line: 44
```

## 10.5 Idempotency

Один и тот же intent должен давать один и тот же результат.

```bash
intentstack build
intentstack build
intentstack build
```

не должен создавать дубликаты компонентов.

---

# 11. DSL v0.1 structure

Файл:

```yaml
version: 0.1

project:
  id: neurotalk
  name: NeuroTalk
  target: web_ts_minimal

theme:
  preset: minimal
  radius: md
  density: comfortable
  color: neutral

entities:
  - id: Lead
    table: leads
    fields:
      - id: name
        type: string
        label: Name
        required: true
      - id: phone
        type: string
        label: Phone
        required: true
      - id: message
        type: text
        label: Message
        required: false
      - id: status
        type: enum
        values: [new, contacted, closed]
        default: new

actions:
  - id: create_lead
    type: create_record
    entity: Lead

  - id: list_leads
    type: list_records
    entity: Lead

pages:
  - id: home
    path: /
    layout: landing
    sections:
      - id: nav
        type: navbar
        logo: NeuroTalk
        items:
          - label: Features
            href: "#features"
          - label: Contact
            href: "#contact"

      - id: hero
        type: hero
        variant: centered
        title: Voice AI for business
        subtitle: Automate customer calls with intelligent voice agents.
        actions:
          - label: Book demo
            kind: primary
            target: "#lead_form"

      - id: features
        type: card_grid
        columns: 3
        items:
          - title: Fast setup
            text: Launch your assistant quickly.
          - title: Smart calls
            text: Handle repetitive conversations.
          - title: Dashboard
            text: Track all incoming leads.

      - id: lead_form
        type: form
        title: Request a demo
        entity: Lead
        submit:
          action: create_lead
          success_message: We will contact you soon.
        fields:
          - name
          - phone
          - message

  - id: dashboard_leads
    path: /dashboard/leads
    layout: dashboard
    sections:
      - id: leads_table
        type: table
        entity: Lead
        source:
          action: list_leads
        columns:
          - name
          - phone
          - status
        row_actions:
          - type: view
          - type: update
```

Это уже полноценный MVP.

---

# 12. Command model

Есть два уровня:

```text
1. Desired-state DSL
2. Patch commands
```

## 12.1 Desired-state DSL

Описывает итоговое состояние приложения.

```yaml
pages:
  - id: home
    path: /
```

## 12.2 Patch DSL

Описывает изменение.

```yaml
version: 0.1
patch:
  - op: page.create
    id: pricing
    path: /pricing
    layout: landing

  - op: section.add
    page: pricing
    section:
      id: pricing_hero
      type: hero
      title: Simple pricing
      subtitle: Choose a plan that fits your team.

  - op: navbar.item.add
    page: home
    navbar: nav
    item:
      label: Pricing
      href: /pricing
```

AI-agent в реальной работе чаще должен писать patch, а не весь app.intent.yaml.

---

# 13. Core command list v0.1

## 13.1 Project commands

```yaml
project.create
project.set_name
project.set_target
project.set_theme
project.set_metadata
```

Пример:

```yaml
- op: project.set_theme
  preset: minimal
  radius: md
  density: comfortable
```

## 13.2 Page commands

```yaml
page.create
page.update
page.delete
page.set_layout
page.set_metadata
page.set_route
```

Пример:

```yaml
- op: page.create
  id: home
  path: /
  layout: landing
```

## 13.3 Layout commands

```yaml
layout.set
layout.add_slot
layout.set_container
layout.set_spacing
```

Пример:

```yaml
- op: layout.set_container
  page: home
  width: xl
```

## 13.4 Section commands

```yaml
section.add
section.update
section.remove
section.move
section.rename
section.set_visibility
```

Пример:

```yaml
- op: section.add
  page: home
  section:
    id: testimonials
    type: card_grid
    columns: 3
```

## 13.5 Text commands

```yaml
text.set
text.append
text.replace
text.clear
```

Пример:

```yaml
- op: text.set
  target: page.home.section.hero.title
  value: AI agents for business
```

## 13.6 Navigation commands

```yaml
navbar.add
navbar.item.add
navbar.item.remove
navbar.item.update
navbar.logo.set
```

Пример:

```yaml
- op: navbar.item.add
  page: home
  navbar: nav
  item:
    label: Pricing
    href: /pricing
```

## 13.7 Component commands

```yaml
component.add
component.update
component.remove
component.move
component.bind_data
component.bind_action
```

Generic example:

```yaml
- op: component.add
  page: home
  section: hero
  component:
    id: cta_button
    type: button
    label: Start now
    variant: primary
    action:
      type: navigate
      to: /signup
```

## 13.8 Form commands

```yaml
form.add
form.field.add
form.field.remove
form.field.update
form.bind_entity
form.bind_submit
form.set_success_message
```

Пример:

```yaml
- op: form.bind_submit
  form: lead_form
  action: create_lead
```

## 13.9 Entity commands

```yaml
entity.create
entity.delete
entity.field.add
entity.field.update
entity.field.remove
entity.index.add
entity.relation.add
```

Пример:

```yaml
- op: entity.create
  id: Lead
  table: leads
  fields:
    - id: name
      type: string
      required: true
    - id: phone
      type: string
      required: true
```

## 13.10 Action commands

```yaml
action.create
action.update
action.delete
action.bind
```

Action types v0.1:

```text
create_record
list_records
get_record
update_record
delete_record
navigate
open_modal
close_modal
show_toast
```

Пример:

```yaml
- op: action.create
  id: create_lead
  type: create_record
  entity: Lead
```

## 13.11 API commands

В v0.1 API можно генерировать автоматически из actions, но команды нужны:

```yaml
api.route.create
api.route.update
api.route.delete
api.bind_action
```

Пример:

```yaml
- op: api.route.create
  id: create_lead_api
  method: POST
  path: /api/leads
  action: create_lead
```

## 13.12 Table commands

```yaml
table.add
table.column.add
table.column.remove
table.column.update
table.bind_source
table.add_filter
table.add_row_action
```

Пример:

```yaml
- op: table.add
  page: dashboard_leads
  id: leads_table
  entity: Lead
  columns: [name, phone, status]
```

---

# 14. Component catalog v0.1

Нужен строгий registry. AI не должен придумывать несуществующие компоненты.

## 14.1 Layout components

```text
container
stack
grid
split
section
spacer
```

## 14.2 Marketing components

```text
navbar
hero
logo_cloud
feature_grid
card_grid
stats
testimonial
pricing_cards
faq
cta
footer
```

## 14.3 App components

```text
sidebar
topbar
breadcrumb
tabs
card
metric_card
data_table
detail_panel
empty_state
```

## 14.4 Form components

```text
form
input
textarea
select
checkbox
radio_group
switch
date_input
submit_button
```

## 14.5 Feedback components

```text
alert
toast
modal
drawer
loading
skeleton
badge
```

---

# 15. Design system v0.1

AI не должен решать визуальные мелочи.

Нужна закрытая система токенов:

```yaml
theme:
  preset: minimal
  radius: md
  density: comfortable
  color: neutral
  shadow: soft
```

## 15.1 Radius tokens

```text
none
sm
md
lg
xl
full
```

Mapping для daisyUI/Tailwind target:

```text
none → rounded-none
sm → rounded-sm
md → rounded-lg
lg → rounded-xl
xl → rounded-2xl
full → rounded-full
```

## 15.2 Density tokens

```text
compact
comfortable
spacious
```

Mapping:

```text
compact → smaller padding, tighter gaps
comfortable → default
spacious → larger sections
```

## 15.3 Visual tone

```text
neutral
brand
success
warning
danger
info
```

## 15.4 Component variants

Button:

```text
primary
secondary
outline
ghost
link
danger
```

Card:

```text
flat
bordered
elevated
interactive
```

Hero:

```text
centered
split
minimal
with_cards
```

Navbar:

```text
simple
centered
dashboard
```

Form:

```text
stacked
inline
card
two_column
```

Table:

```text
simple
striped
bordered
compact
```

---

# 16. Registry design

Registry — это сердце масштабируемости.

Пример registry-файла:

```yaml
component: button
version: 0.1

semantic:
  type: action_trigger
  allowed_parents:
    - hero
    - form
    - card
    - navbar
  props:
    label:
      type: string
      required: true
    variant:
      type: enum
      values: [primary, secondary, outline, ghost, link, danger]
      default: primary
    size:
      type: enum
      values: [sm, md, lg]
      default: md
    action:
      type: ActionRef
      required: false

targets:
  web_ts_minimal:
    framework: react
    ui: daisyui
    emit:
      element: button
      class_map:
        base: btn
        variant:
          primary: btn-primary
          secondary: btn-secondary
          outline: btn-outline
          ghost: btn-ghost
          link: btn-link
          danger: btn-error
        size:
          sm: btn-sm
          md: ""
          lg: btn-lg
```

Потом можно добавить target:

```yaml
targets:
  next_shadcn:
    import: "@/components/ui/button"
    component: Button
    prop_map:
      variant:
        primary: default
        secondary: secondary
        outline: outline
        ghost: ghost
        link: link
        danger: destructive
```

Это позволяет одному DSL работать с разными UI-библиотеками.

---

# 17. Compiler architecture

## 17.1 Pipeline

```text
1. Load
2. Parse
3. Schema validate
4. Normalize
5. Build graph
6. Semantic validate
7. Resolve target capabilities
8. Plan generation
9. Emit files
10. Format files
11. Verify
12. Report
```

## 17.2 Detailed pipeline

### Step 1: Load

Читает:

```text
intent/app.intent.yaml
intent/patches/*.yaml
intentstack.config.yaml
registry/*
```

### Step 2: Parse

YAML/JSON превращается в AST.

Ошибки:

```text
YAML syntax error
unknown top-level key
invalid type
```

### Step 3: Schema validate

Проверяет структуру.

Пример ошибки:

```text
E1004: Field "path" is required for page.create
```

### Step 4: Normalize

Приводит разные формы к одной.

Например:

```yaml
fields:
  - name
  - phone
```

становится:

```yaml
fields:
  - id: name
    ref: Entity.Lead.field.name
  - id: phone
    ref: Entity.Lead.field.phone
```

### Step 5: Build graph

Создает граф:

```text
App
 ├─ Page(home)
 │   ├─ Section(nav)
 │   ├─ Section(hero)
 │   └─ Section(lead_form)
 ├─ Entity(Lead)
 └─ Action(create_lead)
```

### Step 6: Semantic validate

Проверяет смысл:

```text
1. form.entity существует?
2. submit.action существует?
3. action.entity существует?
4. table.columns существуют в entity?
5. page.path уникален?
6. id уникальны?
7. section type поддерживается target adapter?
```

### Step 7: Resolve target capabilities

Например, если target `web_ts_minimal` не поддерживает `server_component`, компилятор должен выдать ошибку:

```text
E3007: Target web_ts_minimal does not support server_component.
```

### Step 8: Plan generation

Создает план файлов:

```yaml
files:
  - path: package.json
    source: project
    mode: overwrite
  - path: src/App.tsx
    source: pages
    mode: managed
  - path: src/pages/Home.tsx
    source: page.home
    mode: managed
  - path: server/index.ts
    source: api
    mode: managed
  - path: server/db/schema.ts
    source: entities
    mode: managed
```

### Step 9: Emit files

Target adapter генерирует код.

### Step 10: Format files

Запускает форматирование:

```text
prettier
rustfmt for compiler
```

### Step 11: Verify

Запускает:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Для MVP можно начать с:

```bash
npm run build
```

### Step 12: Report

Выдает отчет:

```text
Generated:
  18 files created
  3 files updated
  0 files deleted

Warnings:
  W201: No auth configured for dashboard_leads

Next:
  npm run dev
```

---

# 18. Rust crate structure

```text
intentstack/
  Cargo.toml

  crates/
    intent_core/
      src/
        ast.rs
        ir.rs
        graph.rs
        ids.rs
        types.rs
        errors.rs

    intent_parser/
      src/
        yaml.rs
        json.rs
        mod.rs

    intent_validator/
      src/
        schema.rs
        semantic.rs
        capabilities.rs
        diagnostics.rs

    intent_registry/
      src/
        registry.rs
        component.rs
        target.rs
        loader.rs

    intent_planner/
      src/
        plan.rs
        diff.rs
        file_plan.rs

    intent_emitter/
      src/
        emitter.rs
        template.rs
        writer.rs

    target_web_ts_minimal/
      src/
        mod.rs
        project.rs
        frontend.rs
        backend.rs
        database.rs
        components/
          navbar.rs
          hero.rs
          form.rs
          table.rs
          card.rs

    intent_cli/
      src/
        main.rs
        commands/
          new.rs
          build.rs
          apply.rs
          check.rs
          explain.rs
          doctor.rs
```

---

# 19. CLI commands

## 19.1 Create project

```bash
intentstack new neurotalk --target web_ts_minimal
```

Creates:

```text
neurotalk/
  intent/
    app.intent.yaml
  intentstack.config.yaml
  generated project files
```

## 19.2 Check intent

```bash
intentstack check
```

Only validates. No code generation.

## 19.3 Build

```bash
intentstack build
```

Generates code.

## 19.4 Apply patch

```bash
intentstack apply patches/001-add-pricing.yaml
```

Applies patch to intent state.

## 19.5 Explain

```bash
intentstack explain page.home.section.hero
```

Outputs:

```text
hero section is rendered by target_web_ts_minimal::hero
uses daisyUI classes:
  hero
  min-h-screen
  bg-base-100
```

## 19.6 Diff

```bash
intentstack diff
```

Shows planned changes before writing files.

## 19.7 Doctor

```bash
intentstack doctor
```

Checks environment:

```text
Node installed
npm installed
Rust compiler installed
target adapter installed
```

---

# 20. Generated project structure v0.1

For target `web_ts_minimal`:

```text
my-app/
  intent/
    app.intent.yaml
    patches/

  package.json
  vite.config.ts
  tsconfig.json
  index.html

  src/
    main.tsx
    App.tsx
    routes.tsx

    generated/
      pages/
        HomePage.tsx
        DashboardLeadsPage.tsx

      components/
        Navbar.tsx
        Hero.tsx
        LeadForm.tsx
        LeadTable.tsx

      api/
        client.ts

      styles/
        theme.css

    custom/
      components/
      hooks/

  server/
    index.ts
    generated/
      routes/
        leads.ts
      db/
        schema.ts
        client.ts
      validators/
        lead.ts

    custom/
      middleware/
      handlers/

  db/
    sqlite.db
```

---

# 21. Backend generation

## 21.1 Entity → Drizzle schema

Intent:

```yaml
entities:
  - id: Lead
    table: leads
    fields:
      - id: name
        type: string
        required: true
      - id: phone
        type: string
        required: true
```

Generated concept:

```ts
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

## 21.2 Action → Hono route

Intent:

```yaml
actions:
  - id: create_lead
    type: create_record
    entity: Lead
```

Generated concept:

```ts
app.post("/api/leads", async (c) => {
  const body = await c.req.json();
  const parsed = leadCreateSchema.parse(body);

  const result = await db.insert(leads).values(parsed).returning();

  return c.json({ data: result[0] });
});
```

## 21.3 Table source → API client

Intent:

```yaml
source:
  action: list_leads
```

Generated concept:

```ts
export async function listLeads() {
  const res = await fetch("/api/leads");
  return res.json();
}
```

---

# 22. Frontend generation

## 22.1 Page generation

Intent:

```yaml
pages:
  - id: home
    path: /
    layout: landing
```

Generated:

```tsx
export function HomePage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <FeatureGrid />
      <LeadForm />
    </main>
  );
}
```

## 22.2 Component generation

Hero intent:

```yaml
type: hero
variant: centered
title: Voice AI for business
subtitle: Automate customer calls with intelligent voice agents.
```

Generated concept:

```tsx
<section className="hero min-h-[70vh] bg-base-100">
  <div className="hero-content text-center">
    <div className="max-w-3xl">
      <h1 className="text-5xl font-semibold tracking-tight">
        Voice AI for business
      </h1>
      <p className="py-6 text-lg opacity-70">
        Automate customer calls with intelligent voice agents.
      </p>
      <a href="#lead_form" className="btn btn-primary">
        Book demo
      </a>
    </div>
  </div>
</section>
```

## 22.3 Form generation

Intent:

```yaml
type: form
entity: Lead
fields:
  - name
  - phone
  - message
```

Generated concept:

```tsx
<form className="card bg-base-100 border p-6" onSubmit={handleSubmit}>
  <input className="input input-bordered w-full" name="name" />
  <input className="input input-bordered w-full" name="phone" />
  <textarea className="textarea textarea-bordered w-full" name="message" />
  <button className="btn btn-primary w-full">Submit</button>
</form>
```

---

# 23. AI-agent workflow

Вот это очень важная часть.

## 23.1 Agent should not write framework code by default

AI-agent получает system instruction:

```text
You are an IntentStack agent.
You must modify the application through Intent DSL or Intent patches.
Do not write React, Hono, Drizzle, Tailwind, or raw framework code unless the compiler explicitly requires a custom extension.
```

## 23.2 Agent loop

```text
1. User gives request
2. Agent reads current app.intent.yaml
3. Agent reads compiler diagnostics
4. Agent creates intent patch
5. Compiler checks patch
6. If errors: agent fixes patch
7. Compiler builds generated app
8. Verifier runs build/tests
9. Agent summarizes changes to user
```

## 23.3 Agent tools

The AI-agent needs these tools:

```text
intentstack.check
intentstack.apply_patch
intentstack.diff
intentstack.build
intentstack.verify
intentstack.explain
intentstack.list_capabilities
intentstack.get_registry
```

## 23.4 Example agent interaction

User:

> Добавь на главную блок тарифов с тремя планами.

Agent writes:

```yaml
version: 0.1
patch:
  - op: section.add
    page: home
    after: features
    section:
      id: pricing
      type: pricing_cards
      title: Simple pricing
      plans:
        - id: starter
          name: Starter
          price: "$19/mo"
          features:
            - 100 calls
            - Basic dashboard
            - Email support
          action:
            label: Start
            target: "#lead_form"

        - id: growth
          name: Growth
          price: "$49/mo"
          highlighted: true
          features:
            - 1000 calls
            - Advanced dashboard
            - Priority support
          action:
            label: Choose Growth
            target: "#lead_form"

        - id: pro
          name: Pro
          price: Custom
          features:
            - Unlimited calls
            - Custom integrations
            - Dedicated support
          action:
            label: Contact us
            target: "#lead_form"
```

Compiler validates:

```text
OK: page.home exists
OK: section.features exists
OK: pricing_cards supported by web_ts_minimal
OK: actions target #lead_form exists
```

Builds.

Agent says:

```text
Добавил секцию pricing после features. Компилятор сгенерировал PricingCards.tsx и обновил HomePage.tsx.
```

---

# 24. AI-agent prompt contract

Нужно создать специальный документ:

```text
AGENTS.md
```

Пример:

```md
# IntentStack Agent Rules

You are working in an IntentStack project.

## Main rule

Modify application behavior through `intent/app.intent.yaml` or `intent/patches/*.yaml`.

Do not directly edit files under:

- src/generated
- server/generated

## Workflow

1. Inspect current intent.
2. Create a small patch.
3. Run `intentstack check`.
4. Run `intentstack diff`.
5. Run `intentstack build`.
6. Run `npm run build`.

## Prefer small patches

Good:
- one section per patch
- one entity per patch
- one workflow per patch

Bad:
- rewriting the whole app intent for a small text change
```

---

# 25. Diagnostics design

Ошибки компилятора должны быть понятны AI-агенту.

## 25.1 Error format

```json
{
  "code": "E2201",
  "severity": "error",
  "message": "Form 'lead_form' references unknown entity 'Leadx'.",
  "path": "pages.home.sections.lead_form.entity",
  "suggestion": "Did you mean 'Lead'?",
  "fix_hint": {
    "op": "form.bind_entity",
    "form": "lead_form",
    "entity": "Lead"
  }
}
```

## 25.2 Error categories

```text
E1xxx Parse errors
E2xxx Schema errors
E3xxx Semantic errors
E4xxx Target capability errors
E5xxx Generation errors
E6xxx Verification errors
```

## 25.3 Warnings

```text
W1001 Page has no metadata title
W2001 Dashboard page has no auth protection
W3001 Form has no success message
W4001 Table has no empty state
```

Warnings не блокируют build.

---

# 26. Target adapter interface

В Rust можно сделать trait:

```rust
pub trait TargetAdapter {
    fn id(&self) -> &'static str;

    fn capabilities(&self) -> TargetCapabilities;

    fn plan(&self, app: &AppGraph) -> Result<FilePlan, DiagnosticList>;

    fn emit(&self, app: &AppGraph, plan: &FilePlan) -> Result<GeneratedFiles, DiagnosticList>;
}
```

## Capabilities example

```rust
pub struct TargetCapabilities {
    pub frontend: bool,
    pub backend: bool,
    pub database: bool,
    pub supported_components: Vec<ComponentType>,
    pub supported_actions: Vec<ActionType>,
    pub supported_field_types: Vec<FieldType>,
}
```

## web_ts_minimal capabilities

```yaml
target: web_ts_minimal
supports:
  frontend: true
  backend: true
  database: true

components:
  - navbar
  - hero
  - card_grid
  - form
  - table
  - footer
  - stats
  - pricing_cards

actions:
  - create_record
  - list_records
  - get_record
  - update_record
  - delete_record
  - navigate
  - show_toast

field_types:
  - string
  - text
  - number
  - boolean
  - enum
  - datetime
```

---

# 27. Universal scalability model

Чтобы язык был универсальным, нельзя делать так:

```yaml
daisyui_button:
  class: btn btn-primary
```

Это убивает переносимость.

Нужно делать так:

```yaml
type: button
variant: primary
size: md
```

А уже adapter решает:

```text
daisyUI → className="btn btn-primary"
shadcn → <Button variant="default" />
Flutter → ElevatedButton
SwiftUI → Button().buttonStyle(...)
```

## Универсальный принцип

```text
Intent DSL describes what.
Adapter describes how.
```

---

# 28. Domain modules roadmap

IntentStack должен расти доменами.

## v0.1: Web UI + CRUD

```text
pages
sections
components
forms
entities
actions
basic API
basic DB
```

## v0.2: Auth + permissions

```text
users
roles
sessions
protected pages
protected API
RBAC
```

## v0.3: Workflows

```text
email notification
webhook
background job
state machine
approval flow
```

## v0.4: Integrations

```text
CRM
Telegram bot
WhatsApp provider
Stripe-like payments later
external APIs
```

## v0.5: Multi-target

```text
next_shadcn
vue_nuxt
sveltekit
rust_axum
```

## v0.6: Visual graph

```text
Intent graph viewer
patch history
semantic diff
component tree
```

---

# 29. MVP scope

## Must have

```text
1. Rust CLI
2. YAML parser
3. Core IR
4. Semantic validator
5. web_ts_minimal adapter
6. Project generator
7. Page generator
8. Component generator
9. Entity generator
10. Hono route generator
11. Drizzle schema generator
12. Basic API client generator
13. Check/build/diff commands
14. Example app
15. AGENTS.md
```

## Should have

```text
1. Patch application
2. Semantic paths
3. Better diagnostics
4. Component registry files
5. Generated/custom file separation
6. Basic test generation
```

## Could have

```text
1. Live preview
2. Visual graph export
3. OpenAPI generation
4. Storybook
5. Auth
```

## Won’t have in v0.1

```text
1. payments
2. real-time
3. deployment
4. multi-tenant
5. visual editor
6. advanced access control
```

---

# 30. Example end-to-end user story

## User prompt

> Сделай сайт для AI voice assistant компании. Нужны главная, форма заявки, backend для сохранения заявок и dashboard с таблицей лидов.

## AI output

AI creates:

```yaml
version: 0.1

project:
  id: voice_agent_site
  name: VoiceAgent
  target: web_ts_minimal

theme:
  preset: minimal
  radius: md
  density: comfortable
  color: neutral

entities:
  - id: Lead
    table: leads
    fields:
      - id: name
        type: string
        required: true
      - id: phone
        type: string
        required: true
      - id: company
        type: string
        required: false
      - id: message
        type: text
        required: false
      - id: status
        type: enum
        values: [new, contacted, closed]
        default: new

actions:
  - id: create_lead
    type: create_record
    entity: Lead

  - id: list_leads
    type: list_records
    entity: Lead

pages:
  - id: home
    path: /
    layout: landing
    sections:
      - id: nav
        type: navbar
        logo: VoiceAgent
        items:
          - label: Features
            href: "#features"
          - label: Contact
            href: "#lead_form"

      - id: hero
        type: hero
        variant: centered
        title: AI voice agents for business
        subtitle: Automate calls, qualify leads, and reduce manual work.
        actions:
          - label: Book demo
            kind: primary
            target: "#lead_form"

      - id: features
        type: card_grid
        title: What it does
        columns: 3
        items:
          - title: Answers calls
            text: Handles repetitive customer conversations.
          - title: Qualifies leads
            text: Collects contact details and intent.
          - title: Shows dashboard
            text: Tracks every request in one place.

      - id: lead_form
        type: form
        title: Request a demo
        entity: Lead
        fields: [name, phone, company, message]
        submit:
          action: create_lead
          success_message: Thanks. We will contact you soon.

  - id: dashboard_leads
    path: /dashboard/leads
    layout: dashboard
    sections:
      - id: leads_table
        type: table
        entity: Lead
        source:
          action: list_leads
        columns: [name, phone, company, status]
```

## Compiler output

```text
Generated:
  package.json
  vite.config.ts
  src/main.tsx
  src/App.tsx
  src/generated/pages/HomePage.tsx
  src/generated/pages/DashboardLeadsPage.tsx
  src/generated/components/Navbar.tsx
  src/generated/components/Hero.tsx
  src/generated/components/CardGrid.tsx
  src/generated/components/LeadForm.tsx
  src/generated/components/LeadTable.tsx
  server/index.ts
  server/generated/db/schema.ts
  server/generated/routes/leads.ts
  server/generated/validators/lead.ts
```

## Result

```text
/ shows landing page
lead form posts to /api/leads
/api/leads saves to SQLite
/dashboard/leads displays saved leads
```

---

# 31. Semantic diff

Очень важная фича.

Обычный git diff показывает:

```text
+ <div className="card ...">
+ ...
```

IntentStack должен показывать:

```text
Added section:
  page: home
  section: pricing
  type: pricing_cards

Updated:
  page.home.section.hero.title
  old: Voice AI for business
  new: AI voice agents for business
```

Это удобно и человеку, и AI.

---

# 32. Handling custom code

Полностью запрещать custom code нельзя.

Нужно сделать safe extension model.

## 32.1 Generated files

```text
src/generated/*
server/generated/*
```

Перезаписываются компилятором.

## 32.2 Custom files

```text
src/custom/*
server/custom/*
```

Не перезаписываются.

## 32.3 Custom component reference

Intent:

```yaml
sections:
  - id: custom_roi_calculator
    type: custom_component
    component: RoiCalculator
    source: src/custom/components/RoiCalculator.tsx
```

Компилятор проверяет:

```text
file exists
component export exists
props match expected schema
```

Для v0.1 можно только зарезервировать эту модель, не реализовывать полностью.

---

# 33. Versioning

DSL должен иметь версию:

```yaml
version: 0.1
```

Потом:

```yaml
version: 0.2
```

Нужны migrators:

```bash
intentstack migrate --from 0.1 --to 0.2
```

Пример:

```text
v0.1: field.required: true
v0.2: field.validation.required: true
```

Compiler должен уметь сказать:

```text
E0002: Unsupported DSL version 0.3. Current compiler supports 0.1 and 0.2.
```

---

# 34. Testing strategy

## 34.1 Compiler unit tests

```text
parse valid YAML
reject invalid YAML
validate missing page path
validate duplicate ids
validate unknown entity reference
validate unknown action reference
```

## 34.2 Snapshot tests

Для каждого intent-примера:

```text
input: examples/landing.intent.yaml
output snapshot:
  src/generated/pages/HomePage.tsx
  server/generated/routes/leads.ts
```

Если output меняется — snapshot покажет.

## 34.3 End-to-end tests

```text
intentstack new test-app
intentstack build
npm install
npm run build
npm run test
```

## 34.4 Golden examples

```text
examples/
  landing_page/
  lead_capture/
  dashboard_crud/
  simple_admin/
```

Каждый example должен всегда компилироваться.

---

# 35. Security and safety basics

Даже в MVP надо заложить базовую безопасность.

## 35.1 Input validation

Каждая форма должна генерировать validation schema.

```text
Frontend validation — optional
Backend validation — required
```

## 35.2 No arbitrary code execution from intent

Intent DSL не должен позволять:

```yaml
run: rm -rf *
```

или:

```yaml
script: arbitrary JS
```

В v0.1 только whitelist-команды.

## 35.3 API limits

Для generated CRUD:

```text
required validation
safe JSON parsing
basic error handling
no raw SQL from user input
```

## 35.4 Future auth warning

Если dashboard создается без auth, compiler должен дать warning:

```text
W2001: Dashboard page '/dashboard/leads' is public. Add auth before production.
```

---

# 36. Performance expectations

Для v0.1:

```text
intentstack check < 300ms for small project
intentstack build < 2s for small project
generated app build should pass
```

Больше важно не raw speed, а предсказуемость.

---

# 37. Metrics

## Product metrics

```text
1. % successful builds from AI-generated intent
2. average compiler errors per generated patch
3. average repair iterations
4. generated files count
5. manual code edits avoided
6. time from prompt to working app
```

## Quality metrics

```text
1. TypeScript build passes
2. no duplicate ids
3. no broken entity/action refs
4. API routes match frontend calls
5. forms match entity fields
```

## AI-agent metrics

```text
1. patch validity rate
2. first-pass compile rate
3. semantic correction success rate
4. hallucinated component rate
```

---

# 38. Roadmap

## Phase 0 — Research prototype

Goal:

```text
Prove YAML → React page generation
```

Deliverables:

```text
1. app.intent.yaml
2. Rust parser
3. one hardcoded target
4. generate HomePage.tsx
5. generate package.json
```

## Phase 1 — UI MVP

Goal:

```text
Generate usable frontend
```

Components:

```text
navbar
hero
card_grid
form
footer
stats
pricing_cards
```

Deliverables:

```text
1. theme tokens
2. daisyUI class mapper
3. component registry
4. Vite project generator
```

## Phase 2 — Backend MVP

Goal:

```text
Generate Hono API + SQLite DB
```

Deliverables:

```text
1. entity schema
2. Drizzle schema generator
3. Hono CRUD routes
4. frontend API client
5. form submit integration
```

## Phase 3 — Dashboard MVP

Goal:

```text
Generate admin-style pages
```

Deliverables:

```text
1. dashboard layout
2. sidebar
3. table
4. detail page
5. update/delete actions
```

## Phase 4 — AI-agent mode

Goal:

```text
Make this usable by AI coding agents
```

Deliverables:

```text
1. AGENTS.md
2. patch DSL
3. diagnostics JSON
4. intentstack explain
5. intentstack diff
6. list_capabilities command
```

## Phase 5 — Multi-target proof

Goal:

```text
Prove universality
```

Add second frontend target:

```text
next_shadcn
```

or backend target:

```text
rust_axum
```

This is the moment where the project becomes more than a generator.

---

# 39. First 30 commands to implement

Я бы начал именно с этих:

```text
project.set_theme

page.create
page.update
page.delete

section.add
section.update
section.remove
section.move

text.set

navbar.add
navbar.item.add
navbar.item.remove

entity.create
entity.field.add
entity.field.update
entity.field.remove

action.create
action.delete

form.add
form.field.add
form.field.remove
form.bind_entity
form.bind_submit

table.add
table.column.add
table.column.remove
table.bind_source

api.route.create
api.bind_action

layout.set
component.add
component.update
component.remove
```

Этого достаточно для первого working fullstack.

---

# 40. Example patch library

## Add hero title

```yaml
patch:
  - op: text.set
    target: page.home.section.hero.title
    value: Build AI agents faster
```

## Add form field

```yaml
patch:
  - op: entity.field.add
    entity: Lead
    field:
      id: email
      type: string
      label: Email
      required: true

  - op: form.field.add
    form: lead_form
    field: email
```

## Add dashboard table column

```yaml
patch:
  - op: table.column.add
    table: leads_table
    column: email
```

## Add new page

```yaml
patch:
  - op: page.create
    id: about
    path: /about
    layout: landing

  - op: section.add
    page: about
    section:
      id: about_hero
      type: hero
      title: About us
      subtitle: We build practical AI automation for business.
```

---

# 41. Recommended repository plan

```text
intentstack/
  README.md
  AGENTS.md
  docs/
    vision.md
    dsl.md
    compiler.md
    adapters.md
    ai-agent.md
    registry.md

  examples/
    landing/
      intent/app.intent.yaml
    lead_capture/
      intent/app.intent.yaml
    dashboard_crud/
      intent/app.intent.yaml

  crates/
    intent_core/
    intent_parser/
    intent_validator/
    intent_registry/
    intent_planner/
    intent_emitter/
    target_web_ts_minimal/
    intent_cli/

  templates/
    web_ts_minimal/
      package.json.hbs
      vite.config.ts.hbs
      src/
      server/

  registry/
    components/
      button.yaml
      card.yaml
      hero.yaml
      form.yaml
      table.yaml
      navbar.yaml
    targets/
      web_ts_minimal.yaml
```

---

# 42. Biggest technical risks

## Risk 1: DSL becomes too broad

Solution:

```text
Start with web CRUD only.
Make new domains explicit modules.
```

## Risk 2: AI generates invalid YAML

Solution:

```text
JSON Schema
strict examples
diagnostics with fix_hint
patch mode
```

## Risk 3: Generated code becomes ugly

Solution:

```text
templates
formatters
snapshot tests
small target adapter
```

## Risk 4: Universal abstraction becomes too abstract

Solution:

```text
Use real target first.
Do not design 10 adapters before one works.
```

## Risk 5: Manual edits conflict with generated files

Solution:

```text
generated/custom separation
managed file headers
semantic diff
```

---

# 43. Strategic recommendation

Я бы делал именно так:

```text
v0.1 = IntentStack Compiler for Vite React + daisyUI + Hono + Drizzle
```

Не начинать с Rust frontend.
Не начинать с собственного UI kit.
Не начинать с визуального редактора.
Не начинать с универсальности на бумаге.

Сначала нужно доказать:

```text
Один intent-файл → рабочее fullstack-приложение
```

Потом добавить второй target. Вот тогда станет видно, что язык реально универсальный.

---

# 44. The real innovation

Сильная часть проекта не в том, что он генерирует React.

React-генераторов много.

Сильная часть здесь:

```text
AI-agent writes stable semantic commands.
Compiler owns implementation details.
Adapters make the same intent portable.
Validator catches mistakes before code exists.
Patches change app by meaning, not by lines.
```

Это и есть твой “другой уровень кодинга для ИИ”.

---

# 45. Final MVP definition

## MVP name

```text
IntentStack v0.1 — AI-native fullstack compiler
```

## MVP input

```text
intent/app.intent.yaml
```

## MVP output

```text
working Vite React frontend
working Hono backend
working SQLite/Drizzle database
```

## MVP demo

Пользователь говорит:

> Сделай landing page для AI voice assistant, форму заявки и dashboard лидов.

AI-agent создает intent.

Compiler генерирует app.

App работает.

Потом пользователь говорит:

> Добавь тарифы и поле email в форму.

AI-agent создает patch.

Compiler применяет patch.

App обновляется без ручного React/Hono-кода.

Вот это будет сильный proof-of-concept.

[1]: https://vite.dev/guide/?utm_source=chatgpt.com "Getting Started"
[2]: https://hono.dev/ "Hono - Web framework built on Web Standards"
[3]: https://daisyui.com/?lang=en "daisyUI - Tailwind CSS Component Library"
[4]: https://tailwindcss.com/?utm_source=chatgpt.com "Tailwind CSS - Rapidly build modern websites without ever ..."
[5]: https://orm.drizzle.team/?utm_source=chatgpt.com "Drizzle ORM - next gen TypeScript ORM."
