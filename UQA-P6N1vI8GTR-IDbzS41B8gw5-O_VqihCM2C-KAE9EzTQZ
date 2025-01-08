# TON contracts

[![Version npm](https://img.shields.io/npm/v/ton-contracts.svg?logo=npm)](https://www.npmjs.com/package/ton-contracts)

Collection of tested smart contracts for TON blockchain that is compatible with ton js library.

## Available contracts

- 🚀 Whitelisted Wallet - wallet that by default could send value only to specific address and master key that can send value anywhere.

## Install

```bash
yarn add ton-contracts
```

## Usage

```js
const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC' });
const wallet = await client.openWalletFromCustomContract(WhitelistedWalletSource.create({
    masterKey: masterKey.publicKey,
    restrictedKey: restrictedKey.publicKey,
    whitelistedAddress: whitelistedWallet.wallet.address,
    workchain: 0
}));

// Use wallet as normal wallet

```

# License

MIT
