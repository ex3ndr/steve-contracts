import { Address, Contract, UnknownContractSource, TonClient, Cell, BitStringReader, BitString, ExternalMessage, CommonMessageInfo, RawMessage, BinaryMessage } from "ton";
import { sha256 } from "ton-crypto";
import { createUInt32 } from "./utils/createUInt32";


function padded(data: Buffer, size: number) {
    let res = Buffer.alloc(size);
    for (let i = 0; i < data.length; i++) {
        res[i + (size - data.length)] = data[i];
    }
    return res;
}

function parseHex(src: string) {
    if (src.startsWith('x')) {
        src = src.slice(1);
    }
    if (src.startsWith('0x')) {
        src = src.slice(2);
    }
    if (src.length % 2 !== 0) {
        src = '0' + src;
    }
    return Buffer.from(src, 'hex');
}

export class PowGiverContract implements Contract {

    static async create(address: Address, client: TonClient) {
        return new PowGiverContract(address, client);
    }

    /**
     * Extracts pow params from contract state without need to invoke get pow_params. This is faster, more predictable and allows to handle
     * race conditions when poling from multiple sources
     * @param cell state cell
     * @returns seed and complexity
     */
    static extractPowParamsFromState(cell: Cell) {

        // Reimplementation
        // https://github.com/ton-blockchain/ton/blob/24dc184a2ea67f9c47042b4104bbb4d82289fac1/crypto/smartcont/pow-testgiver-code.fc#L146

        const reader = new BitStringReader(cell.bits);
        reader.skip(32 + 32 + 256);
        const seed = reader.readBuffer(128 / 8);
        const complexity = reader.readBuffer(256 / 8);
        return {
            seed,
            complexity
        }
    }

    /**
     * Creates header of mining job. Just apply random, seed and random again to make a full job.
     * @param wallet wallet to mine to
     * @param expiresSec job expiration unixtime in seconds
     * @returns Buffer of job header
     */
    static createMiningJobHeader(wallet: Address, expiresSec: number) {

        //
        // https://github.com/ton-blockchain/ton/blob/15dfedd371f1dfc4502ab53c6ed99deb1922ab1a/crypto/util/Miner.cpp#L57
        //

        return Buffer.concat([
            Buffer.from([0x0, 0xF2]), // Important prefix: https://github.com/ton-blockchain/ton/blob/15dfedd371f1dfc4502ab53c6ed99deb1922ab1a/crypto/util/Miner.cpp#L50
            Buffer.from('Mine'), // Op
            Buffer.from([0]), // Workchain + Bounce. Set them all to zero.
            createUInt32(expiresSec), // Expire in seconds
            wallet.hash // Wallet hash
        ]);
    }

    /**
     * Creates full mining job
     * @param args.seed giver's current seed
     * @param args.random random value
     * @param args.wallet wallt to mine to
     * @param args.expiresSec job expiration unixtime in seconds
     * @returns Buffer of job
     */
    static createMiningJob(args: { seed: Buffer, random: Buffer, wallet: Address, expiresSec: number }) {

        //
        // Check address
        // 

        if (args.wallet.workChain !== 0) {
            throw Error('Only walelts in basic workchain are supported');
        }

        //
        // https://github.com/ton-blockchain/ton/blob/15dfedd371f1dfc4502ab53c6ed99deb1922ab1a/crypto/util/Miner.cpp#L57
        //

        return Buffer.concat([
            PowGiverContract.createMiningJobHeader(args.wallet, args.expiresSec),
            args.random, // Random
            args.seed, // Seed
            args.random // Random
        ]);
    }

    /**
     * Checks if mining result is valid
     * @param args.seed giver's current seed
     * @param args.random random value
     * @param args.wallet wallt to mine to
     * @param args.expiresSec job expiration unixtime in seconds
     * @param args.hash computed hash
     * @returns 
     */
    static async checkMiningJobHash(args: { seed: Buffer, random: Buffer, wallet: Address, expiresSec: number, hash: Buffer }) {
        const job = PowGiverContract.createMiningJob({ seed: args.seed, random: args.random, wallet: args.wallet, expiresSec: args.expiresSec });
        const hash = await sha256(job);
        return args.hash.equals(hash);
    }

    /**
     * Creates mining message to send to giver
     * @param args.giver giver address 
     * @param args.seed giver seed
     * @param args.random giver random
     * @param args.wallet wallet to mine to
     * @param args.expiresSec expires in seconds
     * @returns 
     */
    static createMiningMessage(args: { giver: Address, seed: Buffer, random: Buffer, wallet: Address, expiresSec: number }) {

        //
        // Check address
        // 

        if (args.wallet.workChain !== 0) {
            throw Error('Only walelts in basic workchain are supported');
        }

        //
        // Message body
        //

        const body = Buffer.concat([
            // Note that 0x00F2 are not in the message, but it is a part of a hashing job
            // Buffer.from([0x0, 0xF2]), // Important prefix: https://github.com/ton-blockchain/ton/blob/15dfedd371f1dfc4502ab53c6ed99deb1922ab1a/crypto/util/Miner.cpp#L50
            Buffer.from('Mine'), // Op
            Buffer.from([0]), // Workchain * 4 + Bounce. Set them all to zero.
            createUInt32(args.expiresSec), // Expire in seconds
            args.wallet.hash, // Wallet hash,
            args.random, // Random
            args.seed, // Seed
            args.random // Random
        ]);

        //
        // External message
        //
        const externalMessage = new ExternalMessage({
            to: args.giver,
            body: new CommonMessageInfo({
                body: new BinaryMessage(body)
            })
        });

        return externalMessage;
    }

    readonly client: TonClient;
    readonly address: Address;
    readonly source = new UnknownContractSource('com.ton.giver', -1, 'Pow Giver');

    private constructor(address: Address, client: TonClient) {
        this.address = address;
        this.client = client;
    }

    getPowParams = async () => {
        let params = await this.client.callGetMethod(this.address, 'get_pow_params');
        let seed = padded(parseHex(params.stack[0][1]), 16);
        let complexity = padded(parseHex(params.stack[1][1]), 32);
        return {
            seed,
            complexity
        }
    }
}