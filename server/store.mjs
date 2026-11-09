import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, punches INTEGER NOT NULL DEFAULT 0, cycles INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, card TEXT NOT NULL REFERENCES cards(id), state TEXT NOT NULL, reward INTEGER NOT NULL, subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, items TEXT NOT NULL, session TEXT UNIQUE, url TEXT, created INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_order ON orders(card) WHERE state IN ('creating','open','processing');
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY);
    `);
  }
  card(id) { return this.db.prepare('SELECT * FROM cards WHERE id=?').get(id); }
  createCard() { const id = randomBytes(24).toString('hex'); this.db.prepare('INSERT INTO cards(id) VALUES(?)').run(id); return this.card(id); }
  openOrder(card) { return this.db.prepare("SELECT * FROM orders WHERE card=? AND state IN ('creating','open','processing')").get(card); }
  order(id) { return this.db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
  reserve(card, items, subtotal, shipping) {
    const active=this.openOrder(card); if(active) return active;
    const c=this.card(card); if(!c) throw Error('Card not found');
    const id=randomUUID();
    this.db.prepare("INSERT INTO orders(id,card,state,reward,subtotal,shipping,items,created) VALUES(?,?,'creating',?,?,?,?,?)").run(id,card,c.punches===5?1:0,subtotal,shipping,JSON.stringify(items),Date.now());
    return this.order(id);
  }
  attach(id, session) { this.db.prepare("UPDATE orders SET state='open',session=?,url=? WHERE id=? AND state='creating'").run(session.id,session.url,id); }
  failCreation(id) { this.db.prepare("UPDATE orders SET state='failed' WHERE id=? AND state='creating'").run(id); }
  // Only verified Stripe payment events call this method. Refunds deliberately do not alter punches.
  event(event, session) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(this.db.prepare('SELECT id FROM events WHERE id=?').get(event.id)){ this.db.exec('COMMIT');return; }
      const order=this.order(session.metadata?.order_id);
      if(!order || (order.session && order.session!==session.id)) throw Error('Unknown checkout session');
      const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type) && session.payment_status==='paid';
      if(paid && order.state!=='paid') {
        if(session.currency!=='usd' || session.amount_subtotal!==order.subtotal || session.total_details?.amount_shipping!==order.shipping || session.total_details?.amount_discount!==(order.reward?Math.round(order.subtotal*.25):0)) throw Error('Payment amount mismatch');
        this.db.prepare("UPDATE orders SET state='paid',session=? WHERE id=?").run(session.id,order.id);
        if(order.reward) this.db.prepare('UPDATE cards SET punches=0,cycles=cycles+1 WHERE id=?').run(order.card);
        else this.db.prepare('UPDATE cards SET punches=MIN(5,punches+1) WHERE id=?').run(order.card);
      } else if(order.state!=='paid') {
        if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)) this.db.prepare("UPDATE orders SET state='expired' WHERE id=?").run(order.id);
        else if(event.type==='checkout.session.completed') this.db.prepare("UPDATE orders SET state='processing',session=? WHERE id=?").run(session.id,order.id);
      }
      this.db.prepare('INSERT INTO events(id) VALUES(?)').run(event.id);
      this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  close() {this.db.close();}
}
