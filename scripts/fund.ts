/** Sends NEAR from the game account: npx tsx --env-file=.env scripts/fund.ts <account> <milliNEAR> */
import { MILLI, chainFromEnv, txHash } from '../apps/server/src/chain.ts';
const chain = chainFromEnv()!;
const [to, milli] = process.argv.slice(2);
const res = await chain.game.transfer({ receiverId: to, amount: BigInt(milli) * MILLI });
console.log('sent', Number(milli) / 1000, 'NEAR to', to, 'tx', txHash(res));
