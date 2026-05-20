import React, { useState, useCallback } from "react";

var STOCKS = [
  { ticker: "NOKIA", exchange: "OMXH", name: "Nokia" },
  { ticker: "FORTUM", exchange: "OMXH", name: "Fortum" },
  { ticker: "NESTE", exchange: "OMXH", name: "Neste" },
  { ticker: "KNEBV", exchange: "OMXH", name: "Kone" },
  { ticker: "UPM", exchange: "OMXH", name: "UPM" },
  { ticker: "SAMPO", exchange: "OMXH", name: "Sampo" },
  { ticker: "ELISA", exchange: "OMXH", name: "Elisa" }
];

var APIKEY = "01c5d366200d40f2a4fddf40629b0856";

var BG = "#07080A";
var PANEL = "#0E1014";
var BORDER = "#1E2530";
var GREEN = "#00E5C0";
var GOLD = "#FFD166";
var RED = "#FF3E5E";
var TEXT = "#DDE4EE";
var MUTED = "#4A5568";

function rsi(closes) {
  var period = 14;
  if (closes.length < period + 1) return null;
  var gains = 0;
  var losses = 0;
  for (var i = closes.length - period; i < closes.length; i++) {
    var d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  return 100 - 100 / (1 + gains / (losses || 0.0001));
}

function sma(closes, period) {
  if (closes.length < period) return null;
  var sum = 0;
  for (var i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}

function momentum(closes) {
  var period = 5;
  if (closes.length < period + 1) return null;
  return ((closes[closes.length - 1] / closes[closes.length - 1 - period]) - 1) * 100;
}

function signal(r, m, s5, s20) {
  var score = 0;
  var reasons = [];
  if (r !== null) {
    if (r < 35) { score += 2; reasons.push("RSI ylimyyty (" + r.toFixed(0) + ")"); }
    else if (r < 45) { score += 1; reasons.push("RSI matala (" + r.toFixed(0) + ")"); }
    else if (r > 65) { score -= 2; reasons.push("RSI yliostettu (" + r.toFixed(0) + ")"); }
    else if (r > 55) { score -= 1; reasons.push("RSI korkea (" + r.toFixed(0) + ")"); }
  }
  if (m !== null) {
    if (m > 2) { score += 1; reasons.push("Momentum +" + m.toFixed(1) + "%"); }
    else if (m < -2) { score -= 1; reasons.push("Momentum " + m.toFixed(1) + "%"); }
  }
  if (s5 && s20) {
    if (s5 > s20) { score += 1; reasons.push("Trendi nouseva"); }
    else { score -= 1; reasons.push("Trendi laskeva"); }
  }
  var sig = score >= 2 ? "OSTA" : score <= -2 ? "MYYNTI" : "ODOTA";
  return { score: score, sig: sig, reasons: reasons };
}

async function fetchStock(ticker, exchange) {
  var symbol = ticker + ".HE";
  var url = "/api/proxy?symbol=" + symbol;
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  var json = await res.json();
  var result = json.chart.result[0];
  if (!result) throw new Error("Ei dataa");
  var closes = result.indicators.quote[0].close.filter(function(x) { return x !== null; });
  var price = closes[closes.length - 1];
  var prevClose = closes[closes.length - 2] || price;
  var change = ((price - prevClose) / prevClose) * 100;
  return { closes: closes, price: price, change: change };
}

async function askAI(data) {
  if (!data || data.length === 0) return "Ei dataa.";
  var lines = data.map(function(s) {
    return s.name + ": " + s.price.toFixed(2) + "EUR (" + (s.change >= 0 ? "+" : "") + s.change.toFixed(2) + "%), RSI " + (s.rsi ? s.rsi.toFixed(0) : "?") + ", Mom " + (s.mom ? s.mom.toFixed(1) : "?") + "%, " + s.sig.sig;
  }).join("\n");
  var res = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: "Olet teknisen analyysin tyokalu OMX Helsinki markkinoille. Saat valmiiksi lasketun datan. Anna lyhyet kaupankäyntiehdotukset suomeksi. Ala koskaan pyydä lisää dataa.",
      messages: [{ role: "user", content: "DATA:\n" + lines + "\n\nAnna: 1) TOP 2 OSTOEHDOTUS: nimi, hinta, stop-loss, perustelu 2) MYYNTIEHDOTUS jos loytyy 3) Markkinatunnelma lyhyesti" }]
    })
  });
  var json = await res.json();
  var block = json.content && json.content.find(function(b) { return b.type === "text"; });
  return block ? block.text : "Virhe.";
}
function App() {
  var allTickers = STOCKS.map(function(s) { return s.ticker; });
  var [stocks, setStocks] = useState([]);
  var [loading, setLoading] = useState(false);
  var [msg, setMsg] = useState("");
  var [pct, setPct] = useState(0);
  var [ai, setAi] = useState("");
  var [aiLoad, setAiLoad] = useState(false);
  var [tab, setTab] = useState("scan");
  var [sel, setSel] = useState(new Set(allTickers));

  var toggle = function(t) {
    setSel(function(p) {
      var n = new Set(p);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  };

  var scan = useCallback(async function() {
    setLoading(true); setStocks([]); setAi(""); setTab("scan");
    var toScan = STOCKS.filter(function(s) { return sel.has(s.ticker); });
    var results = [];
    for (var i = 0; i < toScan.length; i++) {
      var s = toScan[i];
      setMsg(s.name); setPct(Math.round(i / toScan.length * 100));
      try {
        var d = await fetchStock(s.ticker, s.exchange);
        var r = rsi(d.closes);
        var m = momentum(d.closes);
        var s5 = sma(d.closes, 5);
        var s20 = sma(d.closes, 20);
        var sig = signal(r, m, s5, s20);
        results.push({ ticker: s.ticker, name: s.name, price: d.price, change: d.change, rsi: r, mom: m, sma5: s5, sma20: s20, sig: sig, err: null });
      } catch(e) { results.push({ ticker: s.ticker, name: s.name, err: e.message }); }
      await new Promise(function(r) { setTimeout(r, 500); });
    }
    setStocks(results); setPct(100); setLoading(false);
    var valid = results.filter(function(s) { return !s.err; });
    if (!valid.length) { setAi("Datahaku epaonnistui: " + (results[0] && results[0].err)); return; }

  }, [sel]);

  var buys = stocks.filter(function(s) { return s.sig && s.sig.sig === "OSTA"; }).sort(function(a, b) { return b.sig.score - a.sig.score; });
  var sells = stocks.filter(function(s) { return s.sig && s.sig.sig === "MYYNTI"; });

  return React.createElement("div", { style: { fontFamily: "monospace", background: BG, minHeight: "100vh", color: TEXT, maxWidth: 480, margin: "0 auto" } },
    React.createElement("style", null, "* { box-sizing: border-box; } body { margin: 0; background: #07080A; } @keyframes spin { to { transform: rotate(360deg); } }"),

    React.createElement("div", { style: { background: PANEL, borderBottom: "1px solid " + BORDER, padding: "14px 16px", position: "sticky", top: 0, zIndex: 10 } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: GREEN, letterSpacing: "0.15em" } }, "OMX SCANNER"),
      React.createElement("div", { style: { fontSize: 9, color: MUTED } }, "Helsinki - Swing-kauppa")
    ),

    React.createElement("div", { style: { padding: "12px 16px" } },

      React.createElement("div", { style: { background: "#FFD16611", border: "1px solid #FFD16633", borderRadius: 8, padding: "8px 12px", fontSize: 10, color: GOLD, marginBottom: 12 } },
        "Teknista analyysia opetustarkoituksessa - ei sijoitusneuvontaa."
      ),

      React.createElement("div", { style: { background: PANEL, border: "1px solid " + BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 12 } },
        React.createElement("div", { style: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 } }, "Seurattavat osakkeet"),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 } },
          STOCKS.map(function(s) {
            return React.createElement("button", {
              key: s.ticker,
              onClick: function() { toggle(s.ticker); },
              style: { padding: "5px 10px", borderRadius: 16, fontSize: 11, cursor: "pointer", fontFamily: "monospace", border: "none", background: sel.has(s.ticker) ? "#00E5C033" : "#1A2030", color: sel.has(s.ticker) ? GREEN : MUTED, fontWeight: sel.has(s.ticker) ? 700 : 400 }
            }, s.name);
          })
        ),
        React.createElement("button", {
          onClick: scan, disabled: loading,
          style: { width: "100%", padding: 13, borderRadius: 8, border: "none", background: loading ? "#1A2030" : GREEN, color: loading ? MUTED : "#000", fontFamily: "monospace", fontWeight: 700, fontSize: 12, cursor: loading ? "default" : "pointer" }
        }, loading ? msg + "..." : "SKANNAA NYT"),
        loading && React.createElement("div", { style: { height: 2, background: BORDER, borderRadius: 2, marginTop: 8 } },
          React.createElement("div", { style: { height: 2, width: pct + "%", background: GREEN, borderRadius: 2, transition: "width 0.3s" } })
        )
      ),

      stocks.length > 0 && React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 12 } },
        React.createElement("button", { onClick: function() { setTab("scan"); }, style: { flex: 1, padding: 9, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: tab === "scan" ? GREEN : PANEL, color: tab === "scan" ? "#000" : MUTED } }, "Signaalit"),
        React.createElement("button", { onClick: function() { setTab("all"); }, style: { flex: 1, padding: 9, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: tab === "all" ? GREEN : PANEL, color: tab === "all" ? "#000" : MUTED } }, "Kaikki")
      ),

     

      tab === "scan" && stocks.length > 0 && React.createElement("div", null,
        buys.length > 0 && React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8 } }, "OSTA-signaalit (" + buys.length + ")"),
          buys.map(function(s) {
            return React.createElement("div", { key: s.ticker, style: { background: "#00E5C00A", border: "1px solid #00E5C033", borderRadius: 10, padding: "12px 14px", marginBottom: 8 } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 700, fontSize: 15, color: GREEN } }, s.name),
                  React.createElement("div", { style: { fontSize: 10, color: MUTED } }, s.ticker)
                ),
                React.createElement("div", { style: { textAlign: "right" } },
                  React.createElement("div", { style: { fontWeight: 700, fontSize: 16 } }, s.price.toFixed(2) + " EUR"),
                  React.createElement("div", { style: { fontSize: 11, color: s.change >= 0 ? GREEN : RED } }, (s.change >= 0 ? "+" : "") + s.change.toFixed(2) + "%")
                )
              ),
              React.createElement("div", { style: { fontSize: 10, color: MUTED } }, s.sig.reasons.join(" - "))
            );
          })
        ),
        sells.length > 0 && React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8 } }, "MYYNTI-signaalit (" + sells.length + ")"),
          sells.map(function(s) {
            return React.createElement("div", { key: s.ticker, style: { background: "#FF3E5E0A", border: "1px solid #FF3E5E33", borderRadius: 10, padding: "12px 14px", marginBottom: 8 } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 700, fontSize: 15, color: RED } }, s.name),
                  React.createElement("div", { style: { fontSize: 10, color: MUTED } }, s.ticker)
                ),
                React.createElement("div", { style: { textAlign: "right" } },
                  React.createElement("div", { style: { fontWeight: 700, fontSize: 16 } }, s.price.toFixed(2) + " EUR"),
                  React.createElement("div", { style: { fontSize: 11, color: s.change >= 0 ? GREEN : RED } }, (s.change >= 0 ? "+" : "") + s.change.toFixed(2) + "%")
                )
              ),
              React.createElement("div", { style: { fontSize: 10, color: MUTED } }, s.sig.reasons.join(" - "))
            );
          })
        ),
        !buys.length && !sells.length && React.createElement("div", { style: { background: PANEL, border: "1px solid " + BORDER, borderRadius: 10, padding: 20, textAlign: "center", color: MUTED, fontSize: 12 } }, "Ei selkeita signaaleja tanaan.")
      ),

      tab === "all" && stocks.length > 0 && React.createElement("div", { style: { background: PANEL, border: "1px solid " + BORDER, borderRadius: 10, overflow: "hidden" } },
        stocks.filter(function(s) { return !s.err; }).map(function(s, i) {
          var sc = s.sig && s.sig.sig === "OSTA" ? GREEN : s.sig && s.sig.sig === "MYYNTI" ? RED : MUTED;
          return React.createElement("div", { key: s.ticker, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: i < stocks.length - 1 ? "1px solid " + BORDER : undefined } },
            React.createElement("div", { style: { flex: 1 } },
              React.createElement("div", { style: { fontWeight: 700, fontSize: 12 } }, s.name),
              React.createElement("div", { style: { fontSize: 9, color: MUTED } }, "RSI " + (s.rsi ? s.rsi.toFixed(0) : "-"))
            ),
            React.createElement("div", { style: { textAlign: "right", marginRight: 12 } },
              React.createElement("div", { style: { fontSize: 13, fontWeight: 700 } }, s.price.toFixed(2) + " EUR"),
              React.createElement("div", { style: { fontSize: 10, color: s.change >= 0 ? GREEN : RED } }, (s.change >= 0 ? "+" : "") + s.change.toFixed(2) + "%")
            ),
            React.createElement("div", { style: { background: sc + "22", color: sc, padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, minWidth: 48, textAlign: "center" } }, s.sig ? s.sig.sig : "-")
          );
        })
      ),

      React.createElement("div", { style: { height: 24 } })
    )
  );
}

export default App;
