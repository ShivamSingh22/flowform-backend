# FlowForm

A JSON-driven dynamic form builder with real-time collaboration presence. Users visually construct forms by dragging and dropping fields. The builder produces a JSON schema stored in PostgreSQL. That schema is rendered as a live form on the frontend. When multiple users view the same form simultaneously, they see each other's presence in real time — similar to Google Docs cursors.

---

## Core Features

### Authentication
- User registration with email, password, and name
- Login returns a JWT access token
- All routes except register and login require a valid JWT
- Passwords hashed with bcrypt before storage

### Form Management
- Create a new form with a title and an initial JSON schema
- Read a single form by ID (owner only)
- List all forms belonging to the authenticated user
- Update a form's title or schema
- Delete a form
- Publish / unpublish a form (toggle `isPublished`)

### JSON Schema Engine
- Every form is backed by a JSON schema that describes its fields
- Supported field types: text, email, number, textarea, select, checkbox, radio, date
- Each field carries: `id`, `type`, `label`, `placeholder`, `required`, `options` (for select/radio)
- Schema is stored as a PostgreSQL `Json` column via Prisma

### Visual Schema Builder (Frontend)
- Drag-and-drop canvas to add, reorder, and remove fields
- Sidebar with available field types
- Live preview of the form as it is being built
- Editable field properties panel (label, placeholder, required, options)
- Builder writes directly to the Zustand store; save action pushes schema to backend

### Dynamic Form Renderer (Frontend)
- Fetches form schema by ID from the backend
- Renders each field dynamically based on its `type`
- Handles validation (required fields, type constraints)
- Submit action posts form response payload (future feature)

### Real-Time Presence (WebSockets)
- Users who open the same form see each other's presence
- Each connected user is identified by name and a colour
- Presence events: `join`, `leave`, `cursor-move` (optional)
- NestJS native WebSocket gateway — no Socket.io
- Presence state is in-memory per gateway instance (no Redis for now)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS |
| Database | PostgreSQL |
| ORM | Prisma (client generated at `./generated/prisma`) |
| Authentication | JWT (access token only) |
| WebSockets | NestJS native `@nestjs/websockets` |
| Frontend framework | React + TypeScript + Vite |
| Frontend state | Zustand |
| Validation | class-validator + class-transformer |

---

## Data Models

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  createdAt DateTime @default(now())
  forms     Form[]
}

model Form {
  id          String   @id @default(uuid())
  title       String
  schema      Json
  isPublished Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userId      String
  user        User     @relation(fields: [userId], references: [id])
}
```

---

## Folder Structure

```
src/
  prisma/        — PrismaService and PrismaModule (Global)
  auth/          — register, login, JWT strategy, guards
  users/         — user module
  forms/         — form CRUD module
  websocket/     — WebSocket gateway for live presence
  common/        — shared DTOs, decorators, interceptors
```

---

## API Design

### Auth
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/login` | Public | Login, returns JWT |

### Forms
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/forms` | JWT | Create a new form |
| GET | `/forms` | JWT | List my forms |
| GET | `/forms/:id` | JWT | Get a single form |
| PATCH | `/forms/:id` | JWT | Update title or schema |
| DELETE | `/forms/:id` | JWT | Delete a form |
| PATCH | `/forms/:id/publish` | JWT | Toggle published state |

### WebSocket Events
| Event | Direction | Payload | Description |
|---|---|---|---|
| `join-form` | Client → Server | `{ formId, userId, name }` | User opens a form |
| `leave-form` | Client → Server | `{ formId, userId }` | User closes a form |
| `presence-update` | Server → Client | `{ formId, users[] }` | Broadcast updated presence list |

---

## Development Plan

### Week 1 — Prisma Setup ✅
- PrismaService extending PrismaClient, `OnModuleInit`, `$connect`
- PrismaModule decorated `@Global()`, exports PrismaService
- PrismaModule registered in AppModule

### Week 2 — Auth Module
- `POST /auth/register` — hash password, create user, return user object
- `POST /auth/login` — verify credentials, return JWT
- JWT strategy using `passport-jwt`
- `JwtAuthGuard` to protect routes
- DTOs: `RegisterDto`, `LoginDto` with class-validator decorators

### Week 3 — Forms CRUD
- FormsModule with FormsService and FormsController
- Full CRUD: create, list, get, update, delete
- Publish toggle endpoint
- `CreateFormDto`, `UpdateFormDto`
- All endpoints protected by `JwtAuthGuard`
- Ownership check — users can only access their own forms

### Week 4 — React Frontend: Auth Flow
- Vite + React + TypeScript project setup
- Zustand auth store (token, user)
- Register and Login pages
- Axios instance with JWT header injection
- Protected route wrapper
- Redirect to dashboard after login

### Week 5 — Form Renderer
- Fetch form schema by ID from API
- Dynamic field renderer component per field type
- Form state management with Zustand or React Hook Form
- Validation on submit (required, type)
- Success/error feedback UI

### Week 6 — Visual Schema Builder
- Sidebar with draggable field type cards
- Drop canvas using `@dnd-kit/core`
- Field property editor panel
- Live form preview alongside builder
- Save schema to backend on demand

### Week 7 — WebSocket Presence
- NestJS WebSocket gateway wired to form room by `formId`
- `join-form` and `leave-form` handlers
- In-memory presence map per form room
- Broadcast `presence-update` on join and leave
- Frontend presence bar showing connected user avatars

### Week 8 — Deploy and Polish
- Environment config for production (`.env` validation with Joi)
- Backend deployed to Railway or Render
- Frontend deployed to Vercel
- CORS configured for production domain
- End-to-end smoke test
- Demo recording

---

## Development Guidelines

- TypeScript strictly throughout — no implicit `any`
- DTOs with `class-validator` for all request bodies
- Prisma for all database operations — no raw SQL
- One feature at a time — do not build ahead
- No Socket.io — NestJS native WebSockets only
- Passwords always hashed with bcrypt before storing
- JWT guard on every route except `/auth/register` and `/auth/login`
- Ugly working code beats perfect unbuilt code
- Every feature must have a reason — no Kafka for resume padding
- Push to GitHub every single day, even one line counts
