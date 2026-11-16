// ═══════════════════════════════════════════════════════════════════
// finanzas.js — Etapa X.104: liquidación mensual (admin + coach)
// ───────────────────────────────────────────────────────────────────
// Motor de cálculo ÚNICO para que admin.html y coach.html muestren
// exactamente los mismos números. Expone `window.HBFin`.
//
// Cuenta por curso y por mes (hora argentina):
//   Ventas brutas            (lo que pagó el alumno)
//   − Comisión MP / PayPal   (bruto − net_amount; impuestos incluidos)
//   − Reembolsos             (neto de la venta, en el MES del reembolso)
//   − Publicidad del curso   (ad_spend.course_id = curso, por spend_date)
//   = Neto a repartir
//   Coach  = max(0, neto a repartir) × commission_pct
//   HB Lab = neto a repartir − pago coaches   (absorbe meses negativos)
//
// La publicidad "General" (ad_spend sin course_id) NO se descuenta a los
// coaches: la absorbe HB Lab.
//
// ARS y USD se calculan por separado (no se convierte moneda). La
// publicidad se carga en pesos → solo se descuenta de las ventas en ARS.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const TZ = 'America/Argentina/Buenos_Aires';

  // 'YYYY-MM' en hora argentina (una venta a las 22hs del 31 cuenta en ese mes).
  function ymOf(value) {
    if (!value) return null;
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);   // columna DATE
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 7);
    return d.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                 'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  function ymLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${MESES[parseInt(m, 10) - 1] || m} ${y}`;
  }

  // Trae las ventas pagadas + reembolsadas. Si la columna `refunded_at`
  // todavía no existe (SQL de X.104 sin ejecutar), reintenta sin ella.
  async function fetchSales(sb, courseIds) {
    const build = (cols) => {
      let q = sb.from('user_courses').select(cols).in('payment_status', ['paid', 'refunded']);
      if (courseIds) q = q.in('course_id', courseIds);
      return q;
    };
    const base = 'course_id, amount_paid, net_amount, currency, enrolled_at, payment_status';
    let { data, error } = await build(base + ', refunded_at');
    if (error && /refunded_at/i.test(error.message || '')) {
      console.warn('[HBFin] user_courses.refunded_at no existe todavía — corré el SQL de la Etapa X.104.');
      ({ data, error } = await build(base));
    }
    if (error) throw error;
    return data || [];
  }

  function emptyCell() {
    return {
      ventas: 0,
      bruto_ars: 0, neto_ars: 0, reemb_ars: 0, ad_ars: 0,
      bruto_usd: 0, neto_usd: 0, reemb_usd: 0,
    };
  }

  // sales:        filas de user_courses (fetchSales)
  // ads:          filas de ad_spend { course_id, amount_ars, spend_date }
  // coachCourses: filas de coach_courses { coach_id, course_id, commission_pct }
  // Devuelve { rows: [...], generalAds: { ym: monto } }
  //   cada row = { ym, course_id, ...cell, comision_ars, comision_usd,
  //                repartir_ars, repartir_usd, coaches:[{coach_id,pct,pago_ars,pago_usd}],
  //                coaches_ars, coaches_usd, hblab_ars, hblab_usd }
  function build({ sales = [], ads = [], coachCourses = [] }) {
    const cells = {};          // `${ym}|${course_id}` → cell
    const generalAds = {};     // ym → monto ARS sin curso
    const cell = (ym, cid) => {
      const k = `${ym}|${cid}`;
      if (!cells[k]) cells[k] = { ym, course_id: cid, ...emptyCell() };
      return cells[k];
    };

    sales.forEach(s => {
      const cur   = (s.currency || 'ARS').toUpperCase();
      const bruto = Number(s.amount_paid || 0);
      const neto  = s.net_amount != null ? Number(s.net_amount) : bruto;
      const ymV   = ymOf(s.enrolled_at);
      if (!ymV || !s.course_id) return;

      const c = cell(ymV, s.course_id);
      c.ventas++;
      if (cur === 'USD') { c.bruto_usd += bruto; c.neto_usd += neto; }
      else               { c.bruto_ars += bruto; c.neto_ars += neto; }

      // Reembolso: la venta se mantiene en su mes y se descuenta en el mes
      // en que se devolvió la plata.
      if ((s.payment_status || '').toLowerCase() === 'refunded') {
        const ymR = ymOf(s.refunded_at) || ymV;
        const r   = cell(ymR, s.course_id);
        if (cur === 'USD') r.reemb_usd += neto; else r.reemb_ars += neto;
      }
    });

    ads.forEach(a => {
      const ymA   = ymOf(a.spend_date);
      const monto = Number(a.amount_ars || 0);
      if (!ymA || !monto) return;
      if (a.course_id) cell(ymA, a.course_id).ad_ars += monto;
      else             generalAds[ymA] = (generalAds[ymA] || 0) + monto;
    });

    const coachesByCourse = {};
    coachCourses.forEach(cc => {
      (coachesByCourse[cc.course_id] = coachesByCourse[cc.course_id] || [])
        .push({ coach_id: cc.coach_id, pct: Number(cc.commission_pct || 0) });
    });

    const rows = Object.values(cells).map(c => {
      const comision_ars = c.bruto_ars - c.neto_ars;
      const comision_usd = c.bruto_usd - c.neto_usd;
      const repartir_ars = c.neto_ars - c.reemb_ars - c.ad_ars;
      const repartir_usd = c.neto_usd - c.reemb_usd;
      const coaches = (coachesByCourse[c.course_id] || []).map(co => ({
        coach_id: co.coach_id,
        pct:      co.pct,
        pago_ars: Math.max(0, repartir_ars) * co.pct / 100,
        pago_usd: Math.max(0, repartir_usd) * co.pct / 100,
      }));
      const coaches_ars = coaches.reduce((s, x) => s + x.pago_ars, 0);
      const coaches_usd = coaches.reduce((s, x) => s + x.pago_usd, 0);
      return {
        ...c, comision_ars, comision_usd, repartir_ars, repartir_usd,
        coaches, coaches_ars, coaches_usd,
        hblab_ars: repartir_ars - coaches_ars,
        hblab_usd: repartir_usd - coaches_usd,
      };
    });

    return { rows, generalAds };
  }

  // Suma un conjunto de rows (y opcionalmente la publicidad general de esos meses).
  function sum(rows, generalAds = {}, yms = null) {
    const t = {
      ventas: 0, bruto_ars: 0, comision_ars: 0, reemb_ars: 0, ad_ars: 0,
      repartir_ars: 0, coaches_ars: 0, hblab_ars: 0,
      bruto_usd: 0, comision_usd: 0, reemb_usd: 0, repartir_usd: 0, coaches_usd: 0, hblab_usd: 0,
      ad_general: 0,
    };
    rows.forEach(r => {
      Object.keys(t).forEach(k => { if (k !== 'ad_general' && typeof r[k] === 'number') t[k] += r[k]; });
    });
    Object.entries(generalAds).forEach(([ym, v]) => {
      if (!yms || yms.includes(ym)) t.ad_general += v;
    });
    t.hblab_ars -= t.ad_general;   // la pauta general la absorbe HB Lab
    return t;
  }

  // Meses presentes (desc), útil para selectores.
  function months(result) {
    const set = new Set(result.rows.map(r => r.ym));
    Object.keys(result.generalAds).forEach(ym => set.add(ym));
    return [...set].filter(Boolean).sort().reverse();
  }

  window.HBFin = { ymOf, ymLabel, fetchSales, build, sum, months };
})();
