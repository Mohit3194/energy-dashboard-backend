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

// ======================================================
// INFLUXDB SCHEMA
// ======================================================

const MEASUREMENT = "energy_meter";

const TAG_METER_ID = "meterid";

const FIELD_ENERGY = "energy";
const FIELD_POWER = "power";
const FIELD_PEAK_POWER = "peakPower";

const FIELD_COST = null;

// Cost per kWh if cost is not stored in InfluxDB
const COST_PER_KWH = 8;


// ======================================================
// RUN AGGREGATE
// ======================================================

async function runAggregate({
  field,
  aggFn,
  from,
  to,
  meters,
}) {
  const result = {};

  for (const meter of meters) {
    const meterId = String(meter).trim();

    const flux = `
      from(bucket: "${bucket}")
        |> range(
          start: time(v: "${from}T00:00:00Z"),
          stop: time(v: "${to}T23:59:59Z")
        )
        |> filter(fn: (r) =>
          r._measurement == "energy_meter" and
          r._field == "${field}" and
          r.meter_id == "${meterId}"
        )
        |> group(columns: ["meter_id"])
        |> ${aggFn}()
    `;

    console.log("\n================================");
    console.log("REPORT QUERY");
    console.log("Meter:", meterId);
    console.log("Field:", field);
    console.log("Aggregate:", aggFn);
    console.log(flux);
    console.log("================================\n");

    try {
      for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
        const row = tableMeta.toObject(values);

        console.log("RESULT ROW:", row);

        result[meterId] = Number(row._value) || 0;
      }
    } catch (error) {
      console.error(
        `Influx query failed for meter ${meterId}, field ${field}:`,
        error
      );

      throw error;
    }

    // If no result came back, explicitly keep zero.
    if (result[meterId] === undefined) {
      result[meterId] = 0;
    }
  }

  console.log(
    `FINAL ${field} ${aggFn} RESULT:`,
    result
  );

  return result;
}


// ======================================================
// BUILD REPORT ROWS
// ======================================================

async function buildReportRows({
  from,
  to,
  meters,
}) {
  const meterKeys = meters
    .map((m) => String(m).trim())
    .filter(Boolean);

  console.log("\n========================================");
  console.log("BUILD REPORT");
  console.log("FROM:", from);
  console.log("TO:", to);
  console.log("METERS:", meterKeys);
  console.log("BUCKET:", bucket);
  console.log("========================================");

  const [
    kwhByMeter,
    avgPowerByMeter,
    peakPowerByMeter,
    costByMeter,
  ] = await Promise.all([
    runAggregate({
      field: "energy",
      aggFn: "sum",
      from,
      to,
      meters: meterKeys,
    }),

    runAggregate({
      field: "power",
      aggFn: "mean",
      from,
      to,
      meters: meterKeys,
    }),

    runAggregate({
      field: "peakPower",
      aggFn: "max",
      from,
      to,
      meters: meterKeys,
    }),

    Promise.resolve(null),
  ]);

  const rows = meterKeys.map((id) => {
    const kwh = Number(kwhByMeter[id] || 0);

    const avgPower = Number(
      avgPowerByMeter[id] || 0
    );

    const peakPower = Number(
      peakPowerByMeter[id] || 0
    );

    const cost = kwh * COST_PER_KWH;

    return {
      id: Number(id),
      name: METER_ALIASES[id] || `Meter ${id}`,
      kwh,
      avgPower,
      peakPower,
      cost,
    };
  });

  console.log("\nFINAL REPORT:");
  console.log(JSON.stringify(rows, null, 2));

  return rows;
}

// ======================================================
// PDF
// ======================================================

function buildPdfBuffer(rows, { from, to }) {
  return new Promise((resolve, reject) => {

    const doc = new PDFDocument({
      margin: 40,
    });

    const chunks = [];

    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", reject);


    doc
      .fontSize(18)
      .text("Energy Report", {
        align: "left",
      });

    doc
      .fontSize(10)
      .fillColor("#666")
      .text(`${from} to ${to}`);

    doc.moveDown(1.5);


    const totals = rows.reduce(
      (acc, r) => ({
        kwh: acc.kwh + Number(r.kwh || 0),
        cost: acc.cost + Number(r.cost || 0),
      }),
      {
        kwh: 0,
        cost: 0,
      }
    );


    doc
      .fontSize(12)
      .fillColor("#000")
      .text(
        `Total consumption: ${totals.kwh.toFixed(2)} kWh`
      );

    doc.text(
      `Total cost: ₹${totals.cost.toFixed(2)}`
    );

    doc.moveDown(1);


    const colX = [
      40,
      180,
      280,
      380,
      480,
    ];

    const headers = [
      "Meter",
      "kWh",
      "Avg Power",
      "Peak Power",
      "Cost",
    ];


    doc
      .fontSize(10)
      .fillColor("#333");


    headers.forEach((h, i) => {
      doc.text(
        h,
        colX[i],
        doc.y
      );
    });


    doc.moveDown(0.5);


    rows.forEach((r) => {

      const y = doc.y;

      doc.text(
        r.name,
        colX[0],
        y
      );

      doc.text(
        Number(r.kwh).toFixed(2),
        colX[1],
        y
      );

      doc.text(
        Number(r.avgPower).toFixed(2),
        colX[2],
        y
      );

      doc.text(
        Number(r.peakPower).toFixed(2),
        colX[3],
        y
      );

      doc.text(
        `₹${Number(r.cost).toFixed(2)}`,
        colX[4],
        y
      );

      doc.moveDown(0.6);
    });


    doc.end();
  });
}


// ======================================================
// EXCEL
// ======================================================

function buildExcelBuffer(rows) {

  const sheetData = rows.map((r) => ({
    Meter: r.name,

    kWh: Number(
      Number(r.kwh || 0).toFixed(2)
    ),

    "Avg Power (kW)": Number(
      Number(r.avgPower || 0).toFixed(2)
    ),

    "Peak Power (kW)": Number(
      Number(r.peakPower || 0).toFixed(2)
    ),

    "Cost (₹)": Number(
      Number(r.cost || 0).toFixed(2)
    ),
  }));


  const ws =
    XLSX.utils.json_to_sheet(sheetData);

  const wb =
    XLSX.utils.book_new();


  XLSX.utils.book_append_sheet(
    wb,
    ws,
    "Report"
  );


  return XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  });
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
  buildReportRows,
  buildPdfBuffer,
  buildExcelBuffer,
};