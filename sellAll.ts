import { VersionedTransaction, Keypair, SystemProgram, Connection, TransactionInstruction, TransactionMessage, PublicKey, ComputeBudgetProgram } from "@solana/web3.js"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import base58 from "bs58"
import { DISTRIBUTION_WALLETNUM, JITO_FEE, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"
import { historyLog, mainMenuWaiting, readJson, sleep } from "./utils"
import { PumpFunSDK } from "./src/pumpfun";
import { executeJitoTx } from "./executor/jito";
import { getSPLBalance } from "./src/util";
import { readFileSync } from "fs";

const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
let sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));
const exec = async () => {
    try {
        const mintKpStr = readJson("mint.json").at(0)
        if (!mintKpStr) {
            return;
        }

        const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
        const mintkP = Keypair.fromSecretKey(base58.decode(mintKpStr))
        const mintAddress = mintkP.publicKey

        let kps: Keypair[] = []
        kps = readJson().map(kpStr => Keypair.fromSecretKey(base58.decode(kpStr)))
        const lutAddress = JSON.parse(readFileSync("keys/lut.json", "utf-8"));
        if (!lutAddress) {
            return
        }

        const lookupTable = (await connection.getAddressLookupTable(new PublicKey(lutAddress))).value;
        if (!lookupTable) {
            return
        }
        const sellIxs: TransactionInstruction[] = []
        for (let i = 0; i < DISTRIBUTION_WALLETNUM; i++) {
            const sellAmount = await getSPLBalance(connection, mintAddress, kps[i].publicKey)
            if (!sellAmount) continue
            const ix = await makeSellIx(kps[i], Math.floor(sellAmount * 10 ** 6), mintAddress, i)
            sellIxs.push(ix.instructions[0])
        }

        if (!lookupTable) {
            console.log("Lookup table not ready")
            return
        }

        const latestBlockhash = await connection.getLatestBlockhash()
        const transactions: VersionedTransaction[] = [];
        const jitofeeixs = await jitoTxsignature(mainKp);

        const jitoTx = new VersionedTransaction(
            new TransactionMessage({
                payerKey: mainKp.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: jitofeeixs
            }).compileToV0Message()
        )
        transactions.push(jitoTx)

        for (let i = 0; i < DISTRIBUTION_WALLETNUM / 5; i++) {
            const instructions: TransactionInstruction[] = [];

            const start = i * 5
            const end = (i + 1) * 5 < DISTRIBUTION_WALLETNUM ? (i + 1) * 5 : DISTRIBUTION_WALLETNUM
            for (let j = start; j < end; j++)
                instructions.push(sellIxs[j])

            const latestBlockhash = await connection.getLatestBlockhash()
            transactions.push(new VersionedTransaction(
                new TransactionMessage({
                    payerKey: kps[(i * 5 + 1)].publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: instructions
                }).compileToV0Message([lookupTable])
            ))
        }

        transactions[0].sign([mainKp])
        for (let j = 1; j < transactions.length; j++) {
            transactions[j].sign([kps[(j - 1) * 5 + 1]])
            for (let i = 0; i < 5; i++) {
                transactions[j].sign([kps[(j - 1) * 5 + i]])
            }
        }

        const res = await executeJitoTx(transactions, mainKp, commitment)
        await sleep(10000)

        if (res == null)
            console.log("sell is failed")
        else {
            console.log(`jito signature: https://explorer.jito.wtf/bundle/${res}`)
            historyLog(`Sell jito signature: https://explorer.jito.wtf/bundle/${res}`)
        }

    }
    catch (e) {
        console.log("You don't create token and buy yet.\nfirst you have to go step 1\n")
        historyLog("You don't create token and buy yet.\nfirst you have to go step 1\n")
    }

}
// jito FEE
const jitoTxsignature = async (mainKp: Keypair) => {
    const ixs: TransactionInstruction[] = []
    const tipAccounts = [
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    ];
    const jitoFeeWallet = new PublicKey(tipAccounts[Math.floor(tipAccounts.length * Math.random())])
    ixs.push(SystemProgram.transfer({
        fromPubkey: mainKp.publicKey,
        toPubkey: jitoFeeWallet,
        lamports: Math.floor(JITO_FEE * 10 ** 9),
    }))
    return ixs
}
// make sell instructions
const makeSellIx = async (kp: Keypair, sellAmount: number, mintAddress: PublicKey, index: number) => {
    let sellIx = await sdk.getSellInstructionsByTokenAmount(
        kp.publicKey,
        mintAddress,
        BigInt(sellAmount),
        BigInt(1000),
        commitment
    );
    return sellIx
}

export const sell_all = async () => {
    await exec()
    await sleep(5000)
    mainMenuWaiting()
}

