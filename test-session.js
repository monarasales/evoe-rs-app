const express = require("express");
const session = require("express-session");

const app = express();
app.use(express.json());

app.use(
  session({
    name: "test.sid",
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.get("/test", (req, res) => {
  console.log("GET /test - session:", req.session);
  res.json({ sessionId: req.sessionID });
});

app.post("/set-session", (req, res) => {
  console.log("POST /set-session - before:", req.session);
  req.session.userId = "test-user";
  console.log("POST /set-session - after:", req.session);
  res.json({ ok: true, sessionID: req.sessionID });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});
