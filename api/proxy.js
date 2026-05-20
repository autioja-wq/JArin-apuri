export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'POST') {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    var data = await response.json();
    return res.status(200).json(data);
  }

  var symbol = req.query.symbol;
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=60d';
  try {
    var response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    var data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
