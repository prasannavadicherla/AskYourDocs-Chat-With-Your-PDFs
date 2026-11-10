// USD per million tokens. Defaults are Gemini 2.5 Flash Lite. Check current pricing and set these in .env.
function prices() {
  return {
    input: Number(process.env.PRICE_INPUT_PER_MTOK || 0.1),
    output: Number(process.env.PRICE_OUTPUT_PER_MTOK || 0.4),
  };
}

function costUsd(inputTokens, outputTokens) {
  const p = prices();
  return Number(((inputTokens * p.input + outputTokens * p.output) / 1e6).toFixed(6));
}

module.exports = { costUsd };
