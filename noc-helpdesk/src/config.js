import 'dotenv/config';

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 4310),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'synoc',
    password: process.env.DB_PASSWORD || 'synoc_password',
    database: process.env.DB_NAME || 'synoc_noc',
    rootUser: process.env.DB_ROOT_USER || 'synoc_admin',
    rootPassword: process.env.DB_ROOT_PASSWORD || 'synoc_admin_password',
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  },

  auth: {
    jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  },

  app: {
    name: process.env.APP_NAME || 'SYNOC',
    org: process.env.APP_ORG || 'NOC',
    timezone: process.env.TIMEZONE || 'Asia/Jakarta',
  },
};
