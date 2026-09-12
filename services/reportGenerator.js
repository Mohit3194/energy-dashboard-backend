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

const MEASUREMENT = "energy_meter";
const TAG_METER_ID = "meter_id";

const FIELD_ENERGY = "energy";
const FIELD_POWER = "power";
const FIELD_PEAK_POWER = "peakPower";

const COST_PER_KWH = 8;


/* =========================================================
   GET FIRST + LAST CUMULATIVE ENERGY
========================================================= */

async function getEnergyConsumption({
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
          r._measurement == "${MEASUREMENT}" and
          r._field == "${FIELD_ENERGY}" and
          r.meter_id == "${meterId}"
        )
        |> sort(columns: ["_time"])
    `;

    console.log("\n========================================");
    console.log("ENERGY CONSUMPTION QUERY");
    console.log("Meter:", meterId);
    console.log(flux);
    console.log("========================================");

    let firstEnergy = null;
    let lastEnergy = null;
    let firstTime = null;
    let lastTime = null;

    try {
      for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
        const row = tableMeta.toObject(values);

        const energy = Number(row._value);

        if (!Number.isFinite(energy)) {
          continue;
        }

        if (firstEnergy === null) {
          firstEnergy = energy;
          firstTime = row._time;
        }

        lastEnergy = energy;
        lastTime = row._time;
      }
    } catch (error) {
      console.error(
        `Energy query failed for meter ${meterId}:`,
        error
      );

      throw error;
    }

    let consumption = 0;

    if (
      firstEnergy !== null &&
      lastEnergy !== null
    ) {
      consumption = lastEnergy - firstEnergy;
    }

    /*
      Handle meter reset / rollover.
      If last reading is lower than first reading,
      we don't report a negative consumption.
    */
    if (consumption < 0) {
      console.warn(
        `Energy reset detected for meter ${meterId}.`,
        {
          firstEnergy,
          lastEnergy,
        }
      );

      consumption = 0;
    }

    result[meterId] = {
      firstEnergy,
      lastEnergy,
      firstTime,
      lastTime,
      consumption,
    };

    console.log("ENERGY RESULT:", result[meterId]);
  }

  return result;
}


/* =========================================================
   RUN POWER AGGREGATE
========================================================= */

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
          r._measurement == "${MEASUREMENT}" and
          r._field == "${field}" and
          r.meter_id == "${meterId}"
        )
        |> group(columns: ["meter_id"])
        |> ${aggFn}()
    `;

    console.log("\n----------------------------------------");
    console.log("POWER QUERY");
    console.log("Meter:", meterId);
    console.log("Field:", field);
    console.log("Aggregate:", aggFn);
    console.log("----------------------------------------");

    try {
      for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
        const row = tableMeta.toObject(values);

        console.log("POWER RESULT ROW:", row);

        result[meterId] = Number(row._value) || 0;
      }
    } catch (error) {
      console.error(
        `Influx query failed for meter ${meterId}, field ${field}:`,
        error
      );

      throw error;
    }

    if (result[meterId] === undefined) {
      result[meterId] = 0;
    }
  }

  return result;
}


/* =========================================================
   BUILD REPORT
========================================================= */

async function buildReportRows({
  from,
  to,
  meters,
}) {
  console.log("\n========================================");
  console.log("BUILD REPORT");
  console.log("FROM:", from);
  console.log("TO:", to);
  console.log("METERS:", meters);
  console.log("BUCKET:", bucket);
  console.log("========================================");

  const meterKeys = meters
    .map((m) => String(m).trim())
    .filter(Boolean);

  /*
    IMPORTANT:

    Energy is cumulative.
    Therefore we DO NOT use sum(energy).

    We calculate:

    Last Energy - First Energy
  */

  const energyByMeter = await getEnergyConsumption({
    from,
    to,
    meters: meterKeys,
  });

  const avgPowerByMeter = await runAggregate({
    field: FIELD_POWER,
    aggFn: "mean",
    from,
    to,
    meters: meterKeys,
  });

  const peakPowerByMeter = await runAggregate({
    field: FIELD_PEAK_POWER,
    aggFn: "max",
    from,
    to,
    meters: meterKeys,
  });

  const rows = meterKeys.map((id) => {
    const energyData = energyByMeter[id] || {};

    const kwh = Number(
      energyData.consumption || 0
    );

    const avgPower = Number(
      avgPowerByMeter[id] || 0
    );

    const peakPower = Number(
      peakPowerByMeter[id] || 0
    );

    const cost = kwh * COST_PER_KWH;

    return {
      id: Number(id),

      name:
        METER_ALIASES[id] ||
        `Meter ${id}`,

      kwh: Number(kwh.toFixed(2)),

      avgPower: Number(
        avgPower.toFixed(2)
      ),

      peakPower: Number(
        peakPower.toFixed(2)
      ),

      cost: Number(
        cost.toFixed(2)
      ),
    };
  });

  console.log("\n========================================");
  console.log("FINAL REPORT");
  console.log(JSON.stringify(rows, null, 2));
  console.log("========================================");

  return rows;
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  buildReportRows,
};