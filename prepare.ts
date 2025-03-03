import { AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js"
import { historyLog, mainMenuWaiting, saveDataToFile, sleep } from "./utils"
import base58 from "bs58"
import { writeFileSync } from "fs"
import { createAndSendV0Tx, execute } from "./executor/legacy"
import { DEV_PRIVATE, DISTRIBUTION_WALLETNUM, PRIVATE_KEY, PUMP_PROGRAM, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT } from "./constants"
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token"

const commitment = "confirmed"
const connection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const devKp = Keypair.fromSecretKey(base58.decode(DEV_PRIVATE))
let kps: Keypair[] = []
const mintKp = Keypair.generate()
const mintAddress = mintKp.publicKey

const exec = async () => {

    const res = await distributeSol(connection, mainKp, DISTRIBUTION_WALLETNUM)
    if (!res) {
        return
    }
    writeFileSync("keys/mint.json", "")
    saveDataToFile([base58.encode(mintKp.secretKey)], "mint.json")
    const lutAddress = await createLUT()
    if (!lutAddress) {
        console.log("Lut creation failed")
        return
    }
    writeFileSync("keys/lut.json", JSON.stringify(lutAddress))
    await addAddressesToTable(lutAddress, mintAddress, kps)

}

const distributeSol = async (connection: Connection, mainKp: Keypair, distritbutionNum: number) => {
    try {
        const mainSolBal = await connection.getBalance(mainKp.publicKey)
        if (mainSolBal < (SWAP_AMOUNT + 0.03) * 10 ** 9) {
            console.log("Main wallet balance is not enough")
            return null
        }
        const sendSolTx: TransactionInstruction[] = []
        sendSolTx.push(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 })
        )

        for (let i = 0; i < distritbutionNum; i++) {

            const wallet = Keypair.generate()
            kps.push(wallet)

            sendSolTx.push(
                SystemProgram.transfer({
                    fromPubkey: mainKp.publicKey,
                    toPubkey: wallet.publicKey,
                    lamports: Math.floor(SWAP_AMOUNT * 10 ** 9 / distritbutionNum)
                })
            )
        }

        writeFileSync("keys/data.json", JSON.stringify(""))
        saveDataToFile(kps.map(kp => base58.encode(kp.secretKey)))

        let index = 0
        while (true) {
            try {
                if (index > 5) {
                    console.log("Error in distribution")
                    historyLog("Error in distribution")
                    return null
                }
                const siTx = new Transaction().add(...sendSolTx)
                const latestBlockhash = await connection.getLatestBlockhash()
                siTx.feePayer = mainKp.publicKey
                siTx.recentBlockhash = latestBlockhash.blockhash
                const messageV0 = new TransactionMessage({
                    payerKey: mainKp.publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: sendSolTx,
                }).compileToV0Message()
                const transaction = new VersionedTransaction(messageV0)
                transaction.sign([mainKp])
                let txSig = await execute(transaction, latestBlockhash, 1)

                if (txSig) {
                    const distibuteTx = txSig ? `https://solscan.io/tx/${txSig}` : ''
                    console.log("SOL distributed ", distibuteTx)
                    historyLog(distibuteTx)
                    break
                }
                index++
            } catch (error) {
                index++
            }
        }

        console.log("Success in distribution")
        historyLog("Success in distribution")
        return kps
    } catch (error) {
        console.log(`Failed to transfer SOL`, error)
        return null
    }
}

const createLUT = async () => {
    let i = 0
    while (true) {
        if (i > 5) {
            console.log("LUT creation failed, Exiting...")
            historyLog("LUT creation failed, Exiting...")
            return
        }
        try {
            const [lookupTableInst, lookupTableAddress] =
                AddressLookupTableProgram.createLookupTable({
                    authority: mainKp.publicKey,
                    payer: mainKp.publicKey,
                    recentSlot: await connection.getSlot(),
                });

            // Step 3 - Generate a create transaction and send it to the network
            const result = await createAndSendV0Tx([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
                lookupTableInst
            ], mainKp, connection);

            if (!result)
                throw new Error("Lut creation error")

            console.log("Lookup Table Address created successfully!")
            console.log("Lookup Table Address:", lookupTableAddress.toBase58());
            historyLog("Lookup Table Address created successfully!")
            historyLog("Lookup Table Address:" + lookupTableAddress.toBase58());

            await sleep(1000)
            return lookupTableAddress
        } catch (err) {
            console.log("Error in creating Lookuptable. Retrying.")
            i++
        }
    }
}

async function addAddressesToTable(lutAddress: PublicKey, mint: PublicKey, walletKPs: Keypair[]) {

    const walletPKs: PublicKey[] = walletKPs.map(wallet => wallet.publicKey);

    try {
        let i = 0
        while (true) {
            if (i > 5) {
                console.log("Extending LUT failed, Exiting...")
                historyLog("Extending LUT failed, Exiting...")
                return
            }

            // Step 1 - Adding bundler wallets
            const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable({
                payer: mainKp.publicKey,
                authority: mainKp.publicKey,
                lookupTable: lutAddress,
                addresses: walletPKs,
            });
            const result = await createAndSendV0Tx([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
                addAddressesInstruction
            ], mainKp, connection);
            if (result) {
                console.log("Successfully added wallet addresses.")
                historyLog("Successfully added wallet addresses.")
                i = 0
                break
            } else {

            }
        }
        await sleep(3000)

        // Step 2 - Adding wallets' token ata
        while (true) {
            if (i > 5) {
                console.log("Extending LUT failed, Exiting...")
                historyLog("Extending LUT failed, Exiting...")
                return
            }

            const baseAtas: PublicKey[] = []

            for (const wallet of walletKPs) {
                const baseAta = getAssociatedTokenAddressSync(mint, wallet.publicKey)
                baseAtas.push(baseAta);
            }

            const addAddressesInstruction1 = AddressLookupTableProgram.extendLookupTable({
                payer: mainKp.publicKey,
                authority: mainKp.publicKey,
                lookupTable: lutAddress,
                addresses: baseAtas,
            });
            const result = await createAndSendV0Tx([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
                addAddressesInstruction1
            ], mainKp, connection);

            if (result) {
                console.log("Successfully added base ata addresses.")
                historyLog("Successfully added base ata addresses.")
                i = 0
                break
            } else {

            }
        }
        await sleep(3000)

        // Step 3 - Adding main wallet and static keys

        while (true) {
            if (i > 5) {
                console.log("Extending LUT failed, Exiting...")
                historyLog("Extending LUT failed, Exiting...")
                return
            }
            const addAddressesInstruction3 = AddressLookupTableProgram.extendLookupTable({
                payer: mainKp.publicKey,
                authority: mainKp.publicKey,
                lookupTable: lutAddress,
                addresses: [mainKp.publicKey, mint, PUMP_PROGRAM, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, SYSVAR_RENT_PUBKEY, NATIVE_MINT],
            });

            const result = await createAndSendV0Tx([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
                addAddressesInstruction3
            ], mainKp, connection);

            if (result) {
                console.log("Successfully added Extending address.")
                historyLog("Successfully added Extending address.")
                i = 0
                break
            } else {
            }
        }
        await sleep(5000)
        console.log("Lookup Table Address extended successfully!")
        historyLog("Lookup Table Address extended successfully!")
        console.log(`Lookup Table Entries: `, `https://explorer.solana.com/address/${lutAddress.toString()}/entries`)
        historyLog(`Lookup Table Entries: ` + `https://explorer.solana.com/address/${lutAddress.toString()}/entries`)
    }
    catch (err) {
        console.log("There is an error in adding addresses in LUT. Please retry it.")
        return;
    }
}

export const prepare = async () => {
    await exec()
    await sleep(5000)
    mainMenuWaiting()
}