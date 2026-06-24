/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import spec from "@/lib/openapi-spec";
import React, { useState, useEffect } from "react";

// Tag colours
const TAG_COLORS: Record<string, string> = {
  Home: "#818cf8",
  Anime: "#34d399",
  Browse: "#f59e0b",
  Schedule: "#fb923c",
  Watch: "#f87171",
};

// Group paths by tag
const grouped: Record<string, string[]> = {};
for (const [path, pathData] of Object.entries(spec.paths)) {
  const method = Object.keys(pathData)[0] as string;
  const endpoint = (pathData as any)[method];
  const tag: string = endpoint.tags?.[0] ?? "Other";
  if (!grouped[tag]) grouped[tag] = [];
  grouped[tag].push(path);
}

export default function DocsPage() {
  const firstPath = Object.keys(spec.paths)[0];
  const [activePath, setActivePath] = useState<string>(firstPath);
  const [prevActivePath, setPrevActivePath] = useState<string>(firstPath);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [testResponse, setTestResponse] = useState<{
    status: number;
    data: unknown;
    loading: boolean;
  } | null>(null);
  const [origin, setOrigin] = useState<string>("https://anikoto-scrap-api.vercel.app");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (activePath !== prevActivePath) {
    setPrevActivePath(activePath);
    setParamValues({});
    setTestResponse(null);
  }

  const handleTestRequest = async (method: string, endpointParams: any[]) => {
    setTestResponse({ status: 0, data: null, loading: true });
    try {
      let url = `/api${activePath}`;
      const queryParams: string[] = [];

      if (endpointParams) {
        endpointParams.forEach((p: any) => {
          const val =
            paramValues[p.name] !== undefined
              ? paramValues[p.name]
              : p.example ||
                (p.schema?.enum
                  ? p.schema.enum[0]
                  : p.schema?.type === "integer"
                  ? "1"
                  : "");
          if (val) {
            if (p.in === "path") {
              url = url.replace(`{${p.name}}`, val);
            } else if (p.in === "query") {
              queryParams.push(`${p.name}=${encodeURIComponent(val)}`);
            }
          }
        });
      }

      if (queryParams.length > 0) url += `?${queryParams.join("&")}`;

      const res = await fetch(url, { method: method.toUpperCase() });
      let data: unknown;
      // Always read as text first to avoid "body stream already read" errors.
      // The watch endpoint returns NDJSON (application/x-ndjson) — collect all
      // chunks and present them as an array of parsed objects.
      const rawText = await res.text();
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('x-ndjson') || contentType.includes('ndjson')) {
        // Parse each non-empty line as a JSON object
        data = rawText
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => { try { return JSON.parse(l); } catch { return l; } });
      } else {
        try { data = JSON.parse(rawText); } catch { data = rawText; }
      }
      setTestResponse({ status: res.status, data, loading: false });

    } catch (err: any) {
      setTestResponse({ status: 0, data: { error: err.message }, loading: false });
    }
  };

  const pathData = (spec.paths as any)[activePath];
  const method = pathData ? (Object.keys(pathData)[0] as string) : "get";
  const endpoint = pathData?.[method];

  // Build example URL preview
  let previewUrl = `/api${activePath}`;
  const previewQuery: string[] = [];
  if (endpoint?.parameters) {
    endpoint.parameters.forEach((p: any) => {
      const val =
        paramValues[p.name] !== undefined
          ? paramValues[p.name]
          : p.example ||
            (p.schema?.enum ? p.schema.enum[0] : p.schema?.type === "integer" ? "1" : "");
      if (val) {
        if (p.in === "path") previewUrl = previewUrl.replace(`{${p.name}}`, val);
        else if (p.in === "query") previewQuery.push(`${p.name}=${val}`);
      }
    });
  }
  if (previewQuery.length) previewUrl += `?${previewQuery.join("&")}`;

  return (
    <div className="docs-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-badge">REST API · v1.0</div>
          <h1 className="sidebar-title">Anikoto Scraper</h1>
          <p className="sidebar-sub">anikoto.net · Next.js · Cheerio</p>
        </div>

        <nav className="sidebar-nav">
          {Object.entries(grouped).map(([tag, paths]) => (
            <div key={tag} className="nav-group">
              <div
                className="nav-group-label"
                style={{ color: TAG_COLORS[tag] ?? "#94a3b8" }}
              >
                {tag}
              </div>
              {paths.map((path) => {
                const m = Object.keys((spec.paths as any)[path])[0];
                return (
                  <div
                    key={path}
                    className={`nav-item ${activePath === path ? "active" : ""}`}
                    onClick={() => setActivePath(path)}
                  >
                    <span className={`method-badge method-${m}`}>{m}</span>
                    <span className="nav-path">{path}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Author: Teramoto</span>
          <span>For educational purposes only.</span>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main">
        {endpoint && (
          <>
            {/* Title */}
            <div className="endpoint-header">
              <h2 className="endpoint-title">{endpoint.summary}</h2>
              <div className="endpoint-url-bar">
                <span className={`method-badge method-${method} lg`}>
                  {method.toUpperCase()}
                </span>
                <code className="endpoint-path">/api{activePath}</code>
              </div>
              {endpoint.description && (
                <p
                  className="endpoint-desc"
                  dangerouslySetInnerHTML={{ __html: endpoint.description }}
                />
              )}
            </div>

            {/* cURL preview */}
            <section className="section">
              <h3 className="section-title">Example Request</h3>
              <div className="code-block">
                <div className="code-block-header">cURL</div>
                <div className="code-block-body">
                  <pre>{`curl -X ${method.toUpperCase()} "${origin}${previewUrl}" \\
  -H "Accept: application/json"`}</pre>
                </div>
              </div>
            </section>

            {/* Parameters */}
            {endpoint.parameters?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Parameters</h3>
                <div className="table-wrap">
                  <table className="params-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>In</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.parameters.map((param: any, idx: number) => {
                        const defaultVal =
                          param.example ||
                          (param.schema?.enum ? param.schema.enum[0] : "");
                        const currentVal =
                          paramValues[param.name] !== undefined
                            ? paramValues[param.name]
                            : defaultVal;
                        return (
                          <tr key={idx}>
                            <td>
                              <span className="param-name">{param.name}</span>
                              {param.required && (
                                <span className="param-required">*</span>
                              )}
                            </td>
                            <td>
                              <span className="param-in">{param.in}</span>
                            </td>
                            <td>
                              <span className="param-type">
                                {param.schema?.type ?? "string"}
                              </span>
                            </td>
                            <td>
                              {param.schema?.enum ? (
                                <select
                                  className="param-input"
                                  value={currentVal}
                                  onChange={(e) =>
                                    setParamValues({
                                      ...paramValues,
                                      [param.name]: e.target.value,
                                    })
                                  }
                                >
                                  {param.schema.enum.map((opt: string) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  className="param-input"
                                  placeholder={String(defaultVal)}
                                  value={currentVal}
                                  onChange={(e) =>
                                    setParamValues({
                                      ...paramValues,
                                      [param.name]: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </td>
                            <td className="param-desc">
                              {param.description ?? "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Send button */}
                <button
                  className="send-btn"
                  disabled={testResponse?.loading}
                  onClick={() =>
                    handleTestRequest(method, endpoint.parameters)
                  }
                >
                  {testResponse?.loading ? "Sending…" : "▶ Send Request"}
                </button>

                {/* Live response */}
                {testResponse && (
                  <div className="live-response">
                    <div className="live-response-header">
                      <span className="live-label">Live Response</span>
                      <span
                        className={`status-badge ${
                          testResponse.status >= 400 ? "error" : "ok"
                        }`}
                      >
                        {testResponse.loading
                          ? "…"
                          : `HTTP ${testResponse.status}`}
                      </span>
                    </div>
                    <div className="live-response-body">
                      {testResponse.loading ? (
                        <span className="muted">Waiting for response…</span>
                      ) : (
                        <pre>
                          {typeof testResponse.data === "object"
                            ? JSON.stringify(testResponse.data, null, 2)
                            : String(testResponse.data)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Response schemas */}
            <section className="section">
              <h3 className="section-title">Responses</h3>
              {Object.entries(endpoint.responses).map(
                ([code, resData]: [string, any]) => {
                  const isError =
                    code.startsWith("4") || code.startsWith("5");
                  const schema =
                    resData.content?.["application/json"]?.schema;
                  return (
                    <div className="response-block" key={code}>
                      <div className="response-header">
                        <span
                          className={`status-badge ${isError ? "error" : "ok"}`}
                        >
                          {code}
                        </span>
                        <span className="muted">{resData.description}</span>
                      </div>
                      {schema && (
                        <div className="response-body">
                          <pre>
                            {JSON.stringify(schema, null, 2).replace(
                              /"\$ref": "#\/components\/schemas\/(.*?)"/g,
                              '"$1": { ... }'
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .docs-root {
    display: flex;
    min-height: 100vh;
    background: #0a0e1a;
    color: #c9d1d9;
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.65;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    background: #080c18;
    border-right: 1px solid rgba(99,102,241,.2);
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    overflow-y: auto;
  }

  .sidebar-header {
    padding: 24px 20px 16px;
    border-bottom: 1px solid rgba(99,102,241,.15);
  }
  .sidebar-badge {
    display: inline-block;
    background: rgba(99,102,241,.15);
    border: 1px solid rgba(99,102,241,.4);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #a5b4fc;
    margin-bottom: 10px;
  }
  .sidebar-title {
    font-size: 16px;
    font-weight: 700;
    color: #e2e8f0;
    margin-bottom: 4px;
  }
  .sidebar-sub {
    font-size: 11px;
    color: #475569;
  }

  .sidebar-nav {
    flex: 1;
    padding: 12px 0;
    overflow-y: auto;
  }

  .nav-group { margin-bottom: 6px; }

  .nav-group-label {
    padding: 8px 20px 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: background .15s, border-color .15s;
  }
  .nav-item:hover { background: rgba(99,102,241,.06); }
  .nav-item.active {
    background: rgba(99,102,241,.1);
    border-left-color: #818cf8;
  }
  .nav-path {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-item.active .nav-path { color: #c7d2fe; }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(255,255,255,.06);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: #334155;
  }

  /* ── Method badges ── */
  .method-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    flex-shrink: 0;
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    letter-spacing: .04em;
  }
  .method-badge.lg {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 6px;
  }
  .method-get  { background: rgba(52,211,153,.15); color: #34d399; border: 1px solid rgba(52,211,153,.3); }
  .method-post { background: rgba(129,140,248,.15); color: #818cf8; border: 1px solid rgba(129,140,248,.3); }
  .method-put  { background: rgba(245,158,11,.15);  color: #f59e0b; border: 1px solid rgba(245,158,11,.3); }
  .method-delete { background: rgba(248,113,113,.15); color: #f87171; border: 1px solid rgba(248,113,113,.3); }

  /* ── Main content ── */
  .main {
    flex: 1;
    margin-left: 280px;
    padding: 48px 60px;
    max-width: 900px;
    min-width: 0;
  }

  .endpoint-header { margin-bottom: 40px; }

  .endpoint-title {
    font-size: 26px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 14px;
  }

  .endpoint-url-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(15,23,42,.8);
    border: 1px solid rgba(99,102,241,.2);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .endpoint-path {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 14px;
    color: #e2e8f0;
    word-break: break-all;
  }

  .endpoint-desc {
    color: #64748b;
    font-size: 14px;
    line-height: 1.7;
  }

  /* ── Sections ── */
  .section { margin-bottom: 40px; }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: #a5b4fc;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(99,102,241,.15);
  }

  /* ── Code block ── */
  .code-block {
    background: rgba(8,12,24,.9);
    border: 1px solid rgba(99,102,241,.18);
    border-radius: 8px;
    overflow: hidden;
  }
  .code-block-header {
    padding: 8px 16px;
    background: rgba(99,102,241,.07);
    border-bottom: 1px solid rgba(99,102,241,.15);
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .code-block-body { padding: 16px; overflow-x: auto; }
  .code-block-body pre {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.6;
  }

  /* ── Params table ── */
  .table-wrap { overflow-x: auto; margin-bottom: 20px; }

  .params-table {
    width: 100%;
    border-collapse: collapse;
  }
  .params-table th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: .06em;
    border-bottom: 1px solid rgba(99,102,241,.15);
  }
  .params-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,.04);
    vertical-align: top;
  }
  .params-table tr:last-child td { border-bottom: none; }

  .param-name {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-weight: 600;
    color: #c7d2fe;
    font-size: 13px;
  }
  .param-required {
    color: #f87171;
    margin-left: 4px;
    font-size: 13px;
  }
  .param-in {
    font-size: 11px;
    color: #475569;
    font-family: var(--font-geist-mono), ui-monospace, monospace;
  }
  .param-type {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 11px;
    color: #818cf8;
    background: rgba(129,140,248,.1);
    border: 1px solid rgba(129,140,248,.2);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .param-desc { color: #64748b; font-size: 13px; }

  .param-input {
    background: rgba(8,12,24,.8);
    border: 1px solid rgba(99,102,241,.25);
    color: #e2e8f0;
    padding: 5px 10px;
    border-radius: 5px;
    width: 100%;
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 12px;
    transition: border-color .15s;
  }
  .param-input:focus {
    outline: none;
    border-color: rgba(129,140,248,.6);
  }

  /* ── Send button ── */
  .send-btn {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    border: none;
    padding: 9px 20px;
    border-radius: 7px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: opacity .15s, transform .1s;
    margin-bottom: 20px;
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  }
  .send-btn:hover { opacity: .88; transform: translateY(-1px); }
  .send-btn:active { transform: translateY(0); }
  .send-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }

  /* ── Live response ── */
  .live-response {
    background: rgba(8,12,24,.9);
    border: 1px solid rgba(99,102,241,.2);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .live-response-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: rgba(99,102,241,.07);
    border-bottom: 1px solid rgba(99,102,241,.15);
  }
  .live-label { font-weight: 600; font-size: 12px; color: #94a3b8; }
  .live-response-body {
    padding: 16px;
    overflow-x: auto;
    max-height: 420px;
    overflow-y: auto;
  }
  .live-response-body pre {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.6;
  }

  /* ── Status badges ── */
  .status-badge {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 5px;
  }
  .status-badge.ok    { color: #34d399; background: rgba(52,211,153,.1); border: 1px solid rgba(52,211,153,.25); }
  .status-badge.error { color: #f87171; background: rgba(248,113,113,.1); border: 1px solid rgba(248,113,113,.25); }

  /* ── Response blocks ── */
  .response-block {
    background: rgba(8,12,24,.7);
    border: 1px solid rgba(99,102,241,.15);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
    transition: border-color .15s;
  }
  .response-block:hover { border-color: rgba(99,102,241,.3); }
  .response-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    background: rgba(99,102,241,.05);
    border-bottom: 1px solid rgba(99,102,241,.1);
  }
  .response-body {
    padding: 16px;
    overflow-x: auto;
  }
  .response-body pre {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-size: 12px;
    color: #64748b;
    line-height: 1.6;
  }

  .muted { color: #475569; font-size: 13px; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(99,102,241,.25); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,.45); }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .sidebar { display: none; }
    .main { margin-left: 0; padding: 24px 20px; }
  }
`;
