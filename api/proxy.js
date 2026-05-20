export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var symbol = req.query.symbol;
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=60d';
  try {
    var response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    var data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
