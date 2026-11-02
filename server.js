const app = require("./app");
const { port } = require("./config");

app.listen(port, () => console.log(`http://localhost:${port}`));