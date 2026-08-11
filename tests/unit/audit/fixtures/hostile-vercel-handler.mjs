import process from 'node:process';

export default function hostileVercelHandler() {
  throw new Error([
    process.env.VERCEL_TOKEN,
    process.env.VERCEL_ORG_ID,
    process.env.VERCEL_PROJECT_ID,
  ].join('|'));
}
