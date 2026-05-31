# Auth — How It Works

## Files

```
src/auth/
  dto/
    register.dto.ts    — shape + validation rules for register body
    login.dto.ts       — shape + validation rules for login body
  auth.service.ts      — register and login business logic
  auth.controller.ts   — HTTP endpoints POST /auth/register and POST /auth/login
  auth.module.ts       — wires the module together, registers JWT and Passport
  jwt.strategy.ts      — tells Passport how to verify a JWT on incoming requests
  jwt-auth.guard.ts    — the guard you put on protected routes
```

---

## The Full Flow

### Register

```
Client → POST /auth/register { email, password, name }
         ↓
ValidationPipe checks RegisterDto (valid email, password ≥ 6 chars, name present)
         ↓
AuthService.register()
  - queries DB for existing user with that email
  - if found → throw ConflictException (409)
  - bcrypt.hash(password, 10) — hashes with 10 salt rounds
  - prisma.user.create(...)
  - returns { id, email, name } — password is never sent back
         ↓
Client receives 201 with user object
```

### Login

```
Client → POST /auth/login { email, password }
         ↓
ValidationPipe checks LoginDto
         ↓
AuthService.login()
  - prisma.user.findUnique({ where: { email } })
  - if not found → throw UnauthorizedException (401)
  - bcrypt.compare(plainPassword, storedHash)
  - if no match → throw UnauthorizedException (401)
  - jwt.sign({ sub: user.id, email: user.email }) — creates token
  - returns { access_token: "eyJ..." }
         ↓
Client stores the token and sends it on every subsequent request
```

### Accessing a Protected Route

```
Client → GET /forms  (Authorization: Bearer eyJ...)
         ↓
JwtAuthGuard intercepts the request
         ↓
Passport extracts the Bearer token from the Authorization header
         ↓
passport-jwt verifies the token signature using JWT_SECRET
  - if expired → 401
  - if tampered → 401
         ↓
JwtStrategy.validate() is called with the decoded payload { sub, email }
  - returns { id: sub, email } — this becomes req.user
         ↓
Request continues to the controller with req.user attached
```

---

## JWT Deep Dive

### Structure of a JWT

A JWT is three Base64URL-encoded segments joined by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← Header
.eyJzdWIiOiJ1c2VyLWlkIiwiZW1haWwiOiJ4QHkuY29tIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDA2MDQ4MDB9  ← Payload
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← Signature
```

- **Header** — algorithm (`HS256`) and token type
- **Payload** — your claims: `sub` (subject = user ID), `email`, `iat` (issued at), `exp` (expiry)
- **Signature** — `HMAC-SHA256(base64(header) + "." + base64(payload), JWT_SECRET)`

The signature is what makes it tamper-proof. Anyone can decode the header and payload (they are just Base64, not encrypted). But without the secret, they cannot forge a valid signature.

### Why `sub` for the user ID?

`sub` (subject) is a registered JWT claim name from the spec (RFC 7519). Using standard claim names keeps your tokens interoperable and readable by any JWT library.

### Stateless by design

The server never stores the token. On each request, it just re-verifies the signature. This means:
- No session table in the database
- Horizontally scalable — any server instance can verify any token
- Downside: you cannot invalidate a token before it expires (unless you build a blocklist)

### `JwtModule.registerAsync` vs `JwtModule.register`

We use `registerAsync` with `ConfigService` injection instead of reading `process.env.JWT_SECRET` directly in the module definition. The reason: NestJS module decorators run at import time, before `ConfigModule` has finished loading the `.env` file. `registerAsync` defers the factory call until the DI container is ready, so `ConfigService` has already parsed the environment.

Same logic applies in `JwtStrategy` — we inject `ConfigService` in the constructor rather than accessing `process.env` at class instantiation time.

### `whitelist: true` on ValidationPipe

Strips any properties from the request body that are not declared in the DTO. Without this, a client could send `{ email, password, isAdmin: true }` and if you spread the body into a Prisma call, that extra field could slip through.

### bcrypt salt rounds

`bcrypt.hash(password, 10)` — the second argument is the cost factor. Each increment doubles the computation time. 10 rounds is the current standard balance between security and response time (~100ms on a modern CPU). The salt is randomly generated per hash and embedded in the output string, so two users with the same password produce different hashes.

---

## Interview Questions

### Fundamentals

**Q: What is a JWT and why do we use it here instead of sessions?**
JWTs are self-contained tokens that carry the user's claims (ID, email) and a signature. The server verifies the signature on every request without looking anything up in the database. Sessions require a session store (Redis, DB) and a session ID cookie. JWTs are stateless and scale horizontally without shared storage.

**Q: What are the three parts of a JWT?**
Header (algorithm + type), Payload (claims), Signature. Header and payload are Base64URL-encoded — not encrypted. The signature is a hash of the first two parts using the secret.

**Q: If the payload is just Base64, can't anyone read it?**
Yes — anyone who holds the token can decode and read the payload. Never put sensitive data (passwords, secrets, PII) in the payload. The signature only guarantees the payload hasn't been tampered with; it doesn't hide it.

**Q: How does the server know a token hasn't been tampered with?**
It re-computes the HMAC signature using its own secret and compares it to the signature in the token. If they don't match, the token is rejected.

**Q: What happens when a JWT expires?**
The `exp` claim is checked during verification. An expired token produces a `TokenExpiredError` which Passport catches and returns a 401. The client must log in again to get a new token.

**Q: How would you revoke a JWT before it expires?**
JWTs are stateless so you cannot revoke them without additional infrastructure. The common approaches:
1. **Token blocklist** — store revoked JTIs (JWT IDs) in Redis and check on each request
2. **Short expiry + refresh tokens** — keep access tokens short-lived (15 min) so the blast radius of a stolen token is small
3. **Rotating secrets** — nuclear option, invalidates all tokens

**Q: Why is `bcrypt.compare` safe against timing attacks?**
`bcrypt.compare` uses a constant-time comparison internally. A naive string comparison short-circuits on the first mismatch, leaking timing information that attackers can use to infer the hash character by character.

**Q: What does `whitelist: true` on ValidationPipe do?**
It strips any request body property not declared in the DTO before the data reaches the service. Without it, extra properties passed by the client could be forwarded to Prisma or other downstream code.

**Q: What is Passport and what role does it play here?**
Passport is an authentication middleware for Node. NestJS wraps it with `@nestjs/passport`. We use the `passport-jwt` strategy, which handles token extraction, verification, and attaching `req.user`. The `JwtAuthGuard` is just a thin NestJS wrapper that triggers the Passport strategy.

**Q: What does `validate()` return in JwtStrategy and where does it go?**
It returns `{ id, email }`. Passport attaches this return value to `req.user`. In protected controllers you can access it via `@Req() req` or a custom `@CurrentUser()` decorator.

**Q: Why `registerAsync` instead of `register` in JwtModule?**
Module metadata decorators are evaluated at import time, before `ConfigModule` loads the `.env` file. `registerAsync` with a factory defers secret resolution until the DI container is fully initialised, so `ConfigService` is available and the environment is loaded.

### Deeper / System Design

**Q: Access tokens vs refresh tokens — when would you add refresh tokens?**
Access tokens (what we have) are short-lived and sent on every request. Refresh tokens are long-lived, stored securely (httpOnly cookie), and used only to issue new access tokens. You'd add them when you want users to stay logged in long-term without a long access token TTL, or when you need the ability to revoke sessions individually.

**Q: Where should the frontend store the JWT?**
Two options: `localStorage` (easy but vulnerable to XSS — any injected script can read it) or an `httpOnly` cookie (inaccessible to JavaScript, but requires CSRF protection). For a form builder with no extreme security requirements `localStorage` is common; for anything handling payments or PII, `httpOnly` cookie is safer.

**Q: How would you make this production-ready?**
- Validate that `JWT_SECRET` is set at startup (using Joi with `ConfigModule.forRoot({ validationSchema })`) — fail fast rather than booting with an undefined secret
- Use asymmetric keys (RS256) if multiple services need to verify tokens without sharing the secret
- Add rate limiting to `/auth/login` to prevent brute-force attacks
- Log failed login attempts
- Add refresh token rotation
