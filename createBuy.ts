import { VersionedTransaction, Keypair, SystemProgram, Transaction, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, AddressLookupTableProgram, PublicKey, SYSVAR_RENT_PUBKEY } from "@solana/web3.js"
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import { openAsBlob, readFileSync, writeFileSync } from "fs";
import base58 from "bs58"

import { DESCRIPTION, DEV_PRIVATE, DEV_SWAP_AMOUNT, DISTRIBUTION_WALLETNUM, FILE, global_mint, JITO_FEE, PRIVATE_KEY, PUMP_PROGRAM, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, TELEGRAM, TOKEN_CREATE_ON, TOKEN_NAME, TOKEN_SHOW_NAME, TOKEN_SYMBOL, TWITTER, WEBSITE } from "./constants"
import { generateDistribution, historyLog, mainMenuWaiting, randVal, readJson, saveDataToFile, sleep } from "./utils"
import { createAndSendV0Tx, execute } from "./executor/legacy"
import { BONDING_CURVE_SEED, PumpFunSDK } from "./src/pumpfun";
import { executeJitoTx, executeJitTx } from "./executor/jito";
import { readFile } from "fs/promises";
import { rl } from "./menu/menu";
import { solanaConnection } from "./gather";
import { connect } from "http2";
import axios from "axios";

const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const devKp = Keypair.fromSecretKey(base58.decode(DEV_PRIVATE))

let sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));

const exec = async () => {
    console.log(`Dev wallet address: ${devKp.publicKey.toString()}`)
    historyLog(`Dev wallet address: ${devKp.publicKey.toString()} \n`)
    console.log(await connection.getBalance(devKp.publicKey) / 10 ** 9, "SOL in Dev Wallet")
    historyLog(`${await connection.getBalance(devKp.publicKey) / 10 ** 9} Sol in Dev Wallet`)

    const mintKpStr = readJson("mint.json").at(0)
    if (!mintKpStr) {
        return;
    }

    const mintKp = Keypair.fromSecretKey(base58.decode(mintKpStr))
    const mintAddress = mintKp.publicKey

    const createBuyIxs: TransactionInstruction[] = []
    const tokenCreationIxs = await createTokenTx(mintKp)

    createBuyIxs.push(...tokenCreationIxs);
    const ix = await makeBuyIx(devKp, mintAddress, DEV_SWAP_AMOUNT * 10 ** 9 * 0.98, true)
    createBuyIxs.push(...ix.ix)

    const latestBlockhash = await connection.getLatestBlockhash()

    const tokenCreationTx = new VersionedTransaction(
        new TransactionMessage({
            payerKey: devKp.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: createBuyIxs
        }).compileToV0Message()
    )

    tokenCreationTx.sign([devKp, mintKp])

    const serializedTx = base58.encode(tokenCreationTx.serialize())
    const resDevBuy = await executeJitTx(serializedTx);
    if (resDevBuy) {
        console.log(`New Mint Address: https://solscan.io/account/${mintAddress.toString()}`)
        console.log(`signature: https://solscan.io/tx/${base58.encode(tokenCreationTx.signatures[0])}`)
        historyLog(`New Mint Address: https://solscan.io/account/${mintAddress.toString()}`)
        historyLog(`Create token and Buy signature: https://solscan.io/tx/${base58.encode(tokenCreationTx.signatures[0])}`)
    }

    let kps: Keypair[] = []
    kps = readJson().map(kpStr => Keypair.fromSecretKey(base58.decode(kpStr)))
    await sleep(800)
    for (let i = 0; i < kps.length; i++) {

        const subKp = kps[i]
        const tranTokenIx = await transferTokenIx(subKp, mintAddress)
        const latestBlock = await connection.getLatestBlockhash()
        const tokenTransferTx = new VersionedTransaction(
            new TransactionMessage({
                payerKey: subKp.publicKey,
                recentBlockhash: latestBlock.blockhash,
                instructions: tranTokenIx
            }).compileToV0Message()
        )
        tokenTransferTx.sign([subKp])
        const serializedTx = base58.encode(tokenTransferTx.serialize())

        const res = await executeJitTx(serializedTx);

        if (res) {
            console.log(`signature: https://solscan.io/tx/${base58.encode(tokenTransferTx.signatures[0])}`)
            historyLog(`Buy and Distribute signature: https://solscan.io/tx/${base58.encode(tokenTransferTx.signatures[0])}`)
        }
    }
}

const transferTokenIx = async (Kp: Keypair, mint: PublicKey) => {
    
}

// create token instructions
const createTokenTx = async (mintKp: Keypair) => {
    
}

// make buy instructions
const makeBuyIx = async (kp: Keypair, mintAddress: PublicKey, buyAmount: number, isDev: boolean) => {
    
}

export const create_Buy = async () => {
    rl.question("\t Do you really want to create new pumpfun token and buy? [y/n]: ", async (answer: string) => {
        let choice = answer;
        console.log(choice)
        switch (choice) {
            case 'y':
                await exec()
                await sleep(5000)
                console.log("One token creating and buying process is ended, and go for next step!")
                break
            case 'n':
                break
            default:
                break
        }
        mainMenuWaiting()
    })
}



