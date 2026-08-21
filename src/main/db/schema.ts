/**
 * Migraciones incrementales. Cada entrada sube `user_version` en uno,
 * de forma que una base ya existente solo aplica lo que le falta.
 */
export const MIGRATIONS: string[] = [
  // v1 — esquema inicial
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    type               TEXT    NOT NULL DEFAULT 'cash',
    currency           TEXT    NOT NULL DEFAULT 'EUR',
    initial_balance    INTEGER NOT NULL DEFAULT 0,
    icon               TEXT    NOT NULL DEFAULT 'wallet',
    color              TEXT    NOT NULL DEFAULT '#4C8DFF',
    exclude_from_total INTEGER NOT NULL DEFAULT 0,
    archived           INTEGER NOT NULL DEFAULT 0,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    note               TEXT,
    created_at         TEXT    NOT NULL
  );

  CREATE TABLE categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    kind       TEXT    NOT NULL CHECK (kind IN ('expense','income')),
    parent_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    icon       TEXT    NOT NULL DEFAULT 'tag',
    color      TEXT    NOT NULL DEFAULT '#8E8E93',
    archived   INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE scheduled (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    type          TEXT    NOT NULL CHECK (type IN ('expense','income','transfer')),
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount        INTEGER NOT NULL,
    amount_to     INTEGER,
    payee         TEXT,
    note          TEXT,
    freq          TEXT    NOT NULL CHECK (freq IN ('daily','weekly','monthly','yearly')),
    interval      INTEGER NOT NULL DEFAULT 1,
    next_date     TEXT    NOT NULL,
    end_date      TEXT,
    auto_post     INTEGER NOT NULL DEFAULT 1,
    active        INTEGER NOT NULL DEFAULT 1,
    last_posted   TEXT,
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT    NOT NULL CHECK (type IN ('expense','income','transfer')),
    date          TEXT    NOT NULL,
    time          TEXT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount        INTEGER NOT NULL,
    amount_to     INTEGER,
    payee         TEXT,
    note          TEXT,
    place         TEXT,
    lat           REAL,
    lon           REAL,
    scheduled_id  INTEGER REFERENCES scheduled(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );

  CREATE INDEX idx_tx_date     ON transactions(date DESC);
  CREATE INDEX idx_tx_account  ON transactions(account_id);
  CREATE INDEX idx_tx_to       ON transactions(to_account_id);
  CREATE INDEX idx_tx_category ON transactions(category_id);
  CREATE INDEX idx_tx_type     ON transactions(type);

  CREATE TABLE tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#8E8E93'
  );

  CREATE TABLE transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
  );
  CREATE INDEX idx_tt_tag ON transaction_tags(tag_id);

  CREATE TABLE attachments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    filename       TEXT    NOT NULL,
    original_name  TEXT    NOT NULL,
    mime           TEXT,
    size           INTEGER,
    created_at     TEXT    NOT NULL
  );
  CREATE INDEX idx_att_tx ON attachments(transaction_id);

  CREATE TABLE budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    amount      INTEGER NOT NULL,
    period      TEXT    NOT NULL CHECK (period IN ('weekly','monthly','quarterly','yearly')),
    start_date  TEXT    NOT NULL,
    rollover    INTEGER NOT NULL DEFAULT 0,
    include_all INTEGER NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE budget_categories (
    budget_id   INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (budget_id, category_id)
  );

  CREATE TABLE rates (
    code       TEXT PRIMARY KEY,
    rate       REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,

  // v2 — reembolsos: dinero que vuelve por un gasto ya hecho.
  //
  // SQLite no permite modificar una restricción CHECK, así que para admitir el
  // nuevo tipo hay que reconstruir las tablas: crear la nueva, copiar, borrar la
  // vieja y renombrar. Las claves foráneas apuntan a `..._new` a propósito:
  // al renombrar, SQLite reescribe esas referencias con el nombre definitivo.
  `
  CREATE TABLE transactions_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT    NOT NULL CHECK (type IN ('expense','income','transfer','refund')),
    date          TEXT    NOT NULL,
    time          TEXT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount        INTEGER NOT NULL,
    amount_to     INTEGER,
    payee         TEXT,
    note          TEXT,
    place         TEXT,
    lat           REAL,
    lon           REAL,
    scheduled_id  INTEGER REFERENCES scheduled(id) ON DELETE SET NULL,
    refund_for_id INTEGER REFERENCES transactions_new(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );

  INSERT INTO transactions_new
    (id, type, date, time, account_id, to_account_id, category_id, amount, amount_to,
     payee, note, place, lat, lon, scheduled_id, created_at, updated_at)
  SELECT
     id, type, date, time, account_id, to_account_id, category_id, amount, amount_to,
     payee, note, place, lat, lon, scheduled_id, created_at, updated_at
    FROM transactions;

  DROP TABLE transactions;
  ALTER TABLE transactions_new RENAME TO transactions;

  CREATE INDEX idx_tx_date      ON transactions(date DESC);
  CREATE INDEX idx_tx_account   ON transactions(account_id);
  CREATE INDEX idx_tx_to        ON transactions(to_account_id);
  CREATE INDEX idx_tx_category  ON transactions(category_id);
  CREATE INDEX idx_tx_type      ON transactions(type);
  CREATE INDEX idx_tx_refund_for ON transactions(refund_for_id);

  CREATE TABLE scheduled_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    type          TEXT    NOT NULL CHECK (type IN ('expense','income','transfer','refund')),
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount        INTEGER NOT NULL,
    amount_to     INTEGER,
    payee         TEXT,
    note          TEXT,
    freq          TEXT    NOT NULL CHECK (freq IN ('daily','weekly','monthly','yearly')),
    interval      INTEGER NOT NULL DEFAULT 1,
    next_date     TEXT    NOT NULL,
    end_date      TEXT,
    auto_post     INTEGER NOT NULL DEFAULT 1,
    active        INTEGER NOT NULL DEFAULT 1,
    last_posted   TEXT,
    created_at    TEXT    NOT NULL
  );

  INSERT INTO scheduled_new
    (id, name, type, account_id, to_account_id, category_id, amount, amount_to, payee, note,
     freq, interval, next_date, end_date, auto_post, active, last_posted, created_at)
  SELECT
     id, name, type, account_id, to_account_id, category_id, amount, amount_to, payee, note,
     freq, interval, next_date, end_date, auto_post, active, last_posted, created_at
    FROM scheduled;

  DROP TABLE scheduled;
  ALTER TABLE scheduled_new RENAME TO scheduled;
  `,

  // v3 — cuentas que no admiten saldo negativo.
  //
  // De una hucha o de la cartera no se puede sacar más de lo que hay, así que
  // esas arrancan con el candado puesto; una tarjeta de crédito o una deuda, al
  // contrario, viven en negativo por definición.
  `
  ALTER TABLE accounts ADD COLUMN allow_negative INTEGER NOT NULL DEFAULT 1;
  UPDATE accounts SET allow_negative = 0 WHERE type IN ('cash','savings');
  `,

  // v4 — categorías con desglose por notas.
  //
  // La mayoría de categorías son un cajón que agrupa cosas distintas: en Deuda
  // están 4Geeks, el PC y el Kindle; en Cultura, cada libro o entrada. Lo que
  // las separa es la nota del movimiento, así que el informe las abre por ahí.
  // Las fijas (el alquiler es el alquiler) no tienen nada que desglosar y
  // arrancan con el desglose apagado.
  `
  ALTER TABLE categories ADD COLUMN breakdown_by_note INTEGER NOT NULL DEFAULT 1;
  UPDATE categories SET breakdown_by_note = 0
   WHERE lower(name) IN (
     'alquiler', 'alimentación', 'alimentacion', 'restaurantes', 'jonesy',
     'a domicilio', 'tabaco', 'transporte'
   );
  `,

  // v5 — devoluciones programadas atadas a su gasto programado.
  //
  // El alquiler se cobra entero y cada mes te devuelven la parte del otro; lo
  // mismo con una suscripción compartida. Son dos programadas distintas, y sin
  // esta columna sus movimientos nacían sueltos y había que enlazarlos a mano
  // mes tras mes. Ahora la devolución apunta a la programada del gasto, y al
  // registrarse se engancha sola al movimiento que acaba de crear aquella.
  `
  ALTER TABLE scheduled ADD COLUMN refund_for_scheduled_id INTEGER REFERENCES scheduled(id) ON DELETE SET NULL;
  `,

  // v6 — hitos de ahorro.
  //
  // Sustituyen a los presupuestos: en vez de un tope de gasto por categoría,
  // una meta con fecha sobre lo que hay en la hucha. La tabla `budgets` se
  // queda donde está, vacía y sin uso: borrarla no aportaría nada y una
  // migración que tira datos es una migración que da miedo.
  `
  CREATE TABLE goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_amount INTEGER NOT NULL,
    target_date   TEXT,
    icon          TEXT    NOT NULL DEFAULT 'piggy',
    color         TEXT    NOT NULL DEFAULT '#34C759',
    note          TEXT,
    achieved_at   TEXT,
    created_at    TEXT    NOT NULL
  );

  CREATE INDEX idx_goals_account ON goals(account_id);
  `,

  // v7 — facturas solo donde hacen falta.
  //
  // Guardar el papel tiene sentido en una compra con garantía; en el café de
  // esta mañana, no. Así que el campo deja de salir en todos los movimientos y
  // se enciende por categoría. Compras arranca con él puesto.
  `
  ALTER TABLE categories ADD COLUMN keeps_invoices INTEGER NOT NULL DEFAULT 0;
  UPDATE categories SET keeps_invoices = 1 WHERE lower(name) = 'compras';
  `,

  // v8 — categorías que son una deuda a plazos.
  //
  // Una cuota de deuda no se pausa: se termina, y a veces antes de tiempo
  // porque se salda de golpe. Sus programaciones cambian el botón de pausa por
  // uno de finalizar, que además les pone fecha de fin para que no revivan.
  `
  ALTER TABLE categories ADD COLUMN is_debt INTEGER NOT NULL DEFAULT 0;
  UPDATE categories SET is_debt = 1 WHERE lower(name) = 'deuda';
  `,

  // v9 — avisos del día antes.
  //
  // `remind` deja silenciar una programación suelta sin apagar los avisos de
  // todas; viene puesta porque quien enciende los avisos los quiere para lo que
  // ya tiene programado. `reminded_for` guarda la fecha de la ocurrencia ya
  // avisada, que es lo que impide repetir el aviso cada vez que se abre la
  // aplicación.
  `
  ALTER TABLE scheduled ADD COLUMN remind INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE scheduled ADD COLUMN reminded_for TEXT;
  `,

  // v10 — planes agotados y deudas saldadas.
  //
  // Una programación con fecha de fin dejaba de generar cuotas al llegar a
  // ella, pero se quedaba encendida en la lista principal: nadie se enteraba de
  // que la deuda estaba pagada. Ahora se apaga sola y pasa a Finalizadas.
  //
  // Hace falta `settled_at` porque apagada no significa terminada: una pausada
  // también lo está, y esa se queda donde estaba esperando a que la reanuden.
  // Terminada es la que tiene fecha aquí. `settled_notified` evita repetir la
  // enhorabuena en cada repaso; las que ya estaban cerradas arrancan marcadas,
  // que celebrar hoy una deuda saldada en marzo no tendría ninguna gracia.
  `
  ALTER TABLE scheduled ADD COLUMN settled_at TEXT;
  ALTER TABLE scheduled ADD COLUMN settled_notified INTEGER NOT NULL DEFAULT 0;

  UPDATE scheduled
     SET settled_at = end_date, settled_notified = 1
   WHERE active = 0 AND end_date IS NOT NULL;
  `,

  // v11 — hitos de ahorro alcanzados.
  //
  // Llegar a la meta merece la misma enhorabuena que saldar una deuda, y hace
  // falta recordar a cuáles ya se les ha dado: sin esto, el repaso de cada media
  // hora la repetiría para siempre.
  //
  // Los que ya estaban conseguidos arrancan marcados. Se cuenta como conseguido
  // el que tiene sello a mano y el que ya llega a su meta con el saldo de su
  // cuenta —la misma suma que hace el saldo: el inicial, más lo que entra, menos
  // lo que sale, más lo que recibe de un traspaso—. Celebrar hoy un hito que se
  // alcanzó en marzo no tendría ninguna gracia.
  `
  ALTER TABLE goals ADD COLUMN reached_notified INTEGER NOT NULL DEFAULT 0;

  UPDATE goals
     SET reached_notified = 1
   WHERE achieved_at IS NOT NULL
      OR target_amount <= (
           SELECT a.initial_balance
                + COALESCE((SELECT SUM(CASE WHEN t.type IN ('income','refund') THEN t.amount ELSE -t.amount END)
                             FROM transactions t WHERE t.account_id = a.id), 0)
                + COALESCE((SELECT SUM(COALESCE(t.amount_to, t.amount))
                             FROM transactions t WHERE t.type = 'transfer' AND t.to_account_id = a.id), 0)
             FROM accounts a WHERE a.id = goals.account_id
         );
  `
]
