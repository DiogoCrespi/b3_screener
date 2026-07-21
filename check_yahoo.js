const yahooUrl = 'https://finance.yahoo.com/rss/headline?s=PETR4.SA';
const proxy = `https://api.codetabs.com/v1/proxy?url=${encodeURIComponent(yahooUrl)}`;

async function test() {
  try {
    const res = await fetch(proxy);
    const text = await res.text();
    console.log(text.substring(0, 1500));
  } catch (e) {
    console.error(e);
  }
}
test();
