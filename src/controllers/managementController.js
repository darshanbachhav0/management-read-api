import { cached } from "../services/cache.js";
import { financeGet } from "../services/financeClient.js";
import { HttpError } from "../utils/httpError.js";

const REPORT_FILTERS = new Set(["period", "dateFrom", "dateTo", "currency", "requestType", "area", "costCenter", "project"]);

function cleanReportFilters(query) {
  const result = {};
  for (const [key, raw] of Object.entries(query || {})) {
    if (!REPORT_FILTERS.has(key)) continue;
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (value.length > 120) throw new HttpError(400, `Filter ${key} is too long.`);
    if ((key === "dateFrom" || key === "dateTo") && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new HttpError(400, `${key} must use YYYY-MM-DD.`);
    }
    if (key === "period" && !/^\d{4}-\d{2}$/.test(value)) {
      throw new HttpError(400, "period must use YYYY-MM.");
    }
    result[key] = value;
  }
  return result;
}

function cacheKey(prefix, params = {}) {
  return `${prefix}:${new URLSearchParams(Object.entries(params).sort()).toString()}`;
}

export async function dashboard(req, res, next) {
  try {
    const data = await cached("dashboard", () => financeGet("/dashboard/summary"));
    res.json({ data, meta: { readOnly: true, source: "UMA Finance Management", generatedAt: new Date().toISOString() } });
  } catch (error) { next(error); }
}

export async function report(req, res, next) {
  try {
    const filters = cleanReportFilters(req.query);
    const payload = await cached(cacheKey("report", filters), () => financeGet("/reports/management", filters));
    res.json({ data: payload?.data ?? payload, meta: { readOnly: true, filters, generatedAt: new Date().toISOString() } });
  } catch (error) { next(error); }
}

export async function filters(req, res, next) {
  try {
    const payload = await cached("report:filters", () => financeGet("/reports/management"));
    const data = payload?.data ?? payload ?? {};
    res.json({ data: data.filterOptions || { areas: [], projects: [], costCenters: [] }, meta: { readOnly: true, generatedAt: new Date().toISOString() } });
  } catch (error) { next(error); }
}

export async function snapshot(req, res, next) {
  try {
    const reportFilters = cleanReportFilters(req.query);
    const [dashboardPayload, reportPayload] = await Promise.all([
      cached("dashboard", () => financeGet("/dashboard/summary")),
      cached(cacheKey("report", reportFilters), () => financeGet("/reports/management", reportFilters))
    ]);
    res.json({
      data: {
        dashboard: dashboardPayload,
        report: reportPayload?.data ?? reportPayload
      },
      meta: {
        readOnly: true,
        filters: reportFilters,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) { next(error); }
}
