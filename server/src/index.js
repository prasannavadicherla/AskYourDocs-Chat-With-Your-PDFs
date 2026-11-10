require('dotenv').config();
const { createApp } = require('./app');

const port = process.env.PORT || 4000;
createApp().listen(port, () => console.log(`API listening on :${port}`));
