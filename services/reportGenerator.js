const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const { queryApi, bucket } = require("./influxClient");

const METER_ALIASES = {
  1: "Main Supply",
  2: "Floor 1",
  3: "Floor 2",
  4: "Floor 3",
  5: "Backup",
};

/*
  ── ADJUST THESE to match your existing Influx write schema ──
  Whatever your meter-polling job already writes with, point these at it.
*/
const MEASUREMENT = "energy_meter"; // measurement name your writes use
const TAG_METER_ID = "meter_id";       // tag key identifying which meter
const FIELD_ENERGY = "energy";           // field: energy consumed
const FIELD_POWER = "power";          // field: instantaneous power (used for avg + peak)
const FIELD_COST = null;              // set to a field name (e.g. "cost") IF you store cost directly

// Used only if FIELD_COST is null — cost is computed from energy instead.
const COST_PER_KWH = 8;

/** Runs one Flux aggregate (sum/mean/max) on one field, grouped by meter, returns { meterId: value }. */
async function runAggregate({ field, aggFn, from, to, meters }) {
  const meterFilter = meters.map((m) => `r.${TAG_METER_ID} == "${m}"`).join(" or ");

  const flux = `
    from(bucket: "${bucket}")
      |> range(start: ${from}T00:00:00Z, stop: ${to}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
      |> filter(fn: (r) => r._field == "${field}")
      |> filter(fn: (r) => ${meterFilter})
      |> group(columns: ["${TAG_METER_ID}"])
      |> ${aggFn}()
  `;

  const result = {};
  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const row = tableMeta.toObject(values);
    result[row[TAG_METER_ID]] = row._value ?? 0;
  }
  return result;
}

/**
 * Pulls aggregated stats per meter from InfluxDB for the given date range.
 * Returns the same shape the frontend ReportsPage expects.
 */
async function buildReportRows({ from, to, meters }) {
  const meterKeys = meters.map(String);

  const [kwhByMeter, avgPowerByMeter, peakPowerByMeter, costByMeter] = await Promise.all([
    runAggregate({ field: FIELD_ENERGY, aggFn: "sum", from, to, meters: meterKeys }),
    runAggregate({ field: FIELD_POWER, aggFn: "mean", from, to, meters: meterKeys }),
    runAggregate({ field: FIELD_POWER, aggFn: "max", from, to, meters: meterKeys }),
    FIELD_COST
      ? runAggregate({ field: FIELD_COST, aggFn: "sum", from, to, meters: meterKeys })
      : Promise.resolve(null),
  ]);

  return meterKeys.map((id) => {
    const kwh = kwhByMeter[id] ?? 0;
    return {
      id: Number(id),
      name: METER_ALIASES[id] ?? `Meter ${id}`,
      kwh,
      avgPower: avgPowerByMeter[id] ?? 0,
      peakPower: peakPowerByMeter[id] ?? 0,
      cost: costByMeter ? costByMeter[id] ?? 0 : kwh * COST_PER_KWH,
    };
  });
}

/** Builds a PDF buffer (in memory, no disk write) summarizing the report rows. */
function buildPdfBuffer(rows, { from, to }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Energy Report", { align: "left" });
    doc.fontSize(10).fillColor("#666").text(`${from} to ${to}`);
    doc.moveDown(1.5);

    const totals = rows.reduce(
      (acc, r) => ({ kwh: acc.kwh + r.kwh, cost: acc.cost + r.cost }),
      { kwh: 0, cost: 0 }
    );
    doc.fontSize(12).fillColor("#000").text(`Total consumption: ${totals.kwh.toFixed(1)} kWh`);
    doc.text(`Total cost: ₹${totals.cost.toFixed(2)}`);
    doc.moveDown(1);

    const colX = [40, 180, 280, 380, 480];
    const headers = ["Meter", "kWh", "Avg Power", "Peak Power", "Cost"];
    doc.fontSize(10).fillColor("#333");
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y));
    doc.moveDown(0.5);

    rows.forEach((r) => {
      const y = doc.y;
      doc.text(r.name, colX[0], y);
      doc.text(r.kwh.toFixed(2), colX[1], y);
      doc.text(r.avgPower.toFixed(2), colX[2], y);
      doc.text(r.peakPower.toFixed(2), colX[3], y);
      doc.text(`₹${r.cost.toFixed(2)}`, colX[4], y);
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

/** Builds an Excel (.xlsx) buffer summarizing the report rows. */
function buildExcelBuffer(rows) {
  const sheetData = rows.map((r) => ({
    Meter: r.name,
    kWh: Number(r.kwh.toFixed(2)),
    "Avg Power (kW)": Number(r.avgPower.toFixed(2)),
    "Peak Power (kW)": Number(r.peakPower.toFixed(2)),
    "Cost (₹)": Number(r.cost.toFixed(2)),
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { buildReportRows, buildPdfBuffer, buildExcelBuffer };
