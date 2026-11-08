import { hashPassword } from "./security.js";

const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set ADMIN_PASSWORD to a password of at least 12 characters.");
  process.exit(1);
}

console.log(await hashPassword(password));
