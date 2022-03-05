const Caver = require('caver-js')
const fs = require('fs')

const bridgeAbi = JSON.parse(fs.readFileSync('build/Bridge.abi', 'utf8'));
const erc20Abi = JSON.parse(fs.readFileSync('build/ServiceChainToken.abi', 'utf8'));
const erc721Abi = JSON.parse(fs.readFileSync('build/ServiceChainNFT.abi', 'utf8'));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function TransferKLAY(deployedBridgeInfo, childToParent) {
    var parent = deployedBridgeInfo.parent
    var child = deployedBridgeInfo.child
    if(childToParent) {
        parent = deployedBridgeInfo.child
        child = deployedBridgeInfo.parent
    }

    const caverChild = new Caver(child.url)
    const caverParent = new Caver(parent.url)
    const parentBridge = new caverParent.contract.create(bridgeAbi, parent.bridgeContract)
    const senderKeyring = caverParent.wallet.keyring.createFromPrivateKey(parent.key)
    const sender = caverParent.wallet.add(senderKeyring).address
    const recipientKeyring = caverChild.wallet.keyring.createFromPrivateKey(parent.key)
    const recipient = caverChild.wallet.add(recipientKeyring).address

    console.log('recipient balance: ' + caverChild.utils.convertFromPeb(await caverChild.rpc.klay.getBalance(recipient), 'KLAY'))
    console.log('source bridge balance: ' + caverParent.utils.convertFromPeb(await caverParent.rpc.klay.getBalance(parent.bridgeContract), 'KLAY'))
    console.log('target bridge balance: ' + caverChild.utils.convertFromPeb(await caverChild.rpc.klay.getBalance(child.bridgeContract), 'KLAY'))
    const value = caverParent.utils.convertToPeb('1', 'KLAY')
    const r = await parentBridge.methods.requestKLAYTransfer(recipient, 0, []).send({from:sender, gas: 100000000, value: value})
    console.log("waiting 10 sec...")
    await sleep(10 * 1000)
    console.log('recipient balance: ' + caverChild.utils.convertFromPeb(await caverChild.rpc.klay.getBalance(recipient), 'KLAY'))
    console.log('source bridge balance: ' + caverParent.utils.convertFromPeb(await caverParent.rpc.klay.getBalance(parent.bridgeContract), 'KLAY'))
    console.log('target bridge balance: ' + caverChild.utils.convertFromPeb(await caverChild.rpc.klay.getBalance(child.bridgeContract), 'KLAY'))
}

async function TransferERC20(deployedBridgeInfo, childToParent) {
    var parent = deployedBridgeInfo.parent
    var child = deployedBridgeInfo.child
    if(childToParent) {
        parent = deployedBridgeInfo.child
        child = deployedBridgeInfo.parent
    }

    const caverChild = new Caver(child.url)
    const caverParent = new Caver(parent.url)
    const parentBridge = new caverParent.contract.create(bridgeAbi, parent.bridgeContract)
    const childBridge = new caverChild.contract.create(bridgeAbi, child.bridgeContract)
    const parentERC20 = new caverParent.contract.create(erc20Abi, parent.erc20)
    const childERC20 = new caverChild.contract.create(erc20Abi, child.erc20)
    const senderKeyring = caverParent.wallet.keyring.createFromPrivateKey(parent.key)
    const sender = caverParent.wallet.add(senderKeyring).address
    const recipientKeyring = caverChild.wallet.keyring.createFromPrivateKey(parent.key)
    const recipient = caverChild.wallet.add(recipientKeyring).address

    console.log('sender balance: ' + await parentERC20.methods.balanceOf(sender).call())
    console.log('recipient balance: ' + await childERC20.methods.balanceOf(recipient).call())
    console.log('source bridge balance: ' + await parentERC20.methods.balanceOf(parentBridge.options.address).call())
    console.log('target bridge balance: ' + await childERC20.methods.balanceOf(childBridge.options.address).call())
    const value = 1
    const r = await parentERC20.methods.requestValueTransfer(value, recipient, 0, []).send({from:sender, gas: 100000000})
    console.log("waiting 10 sec...")
    await sleep(10 * 1000)
    console.log('sender balance: ' + await parentERC20.methods.balanceOf(sender).call())
    console.log('recipient balance: ' + await childERC20.methods.balanceOf(recipient).call())
    console.log('source bridge balance: ' + await parentERC20.methods.balanceOf(parentBridge.options.address).call())
    console.log('target bridge balance: ' + await childERC20.methods.balanceOf(childBridge.options.address).call())
}

async function TransferERC721(deployedBridgeInfo, childToParent) {
    var parent = deployedBridgeInfo.parent
    var child = deployedBridgeInfo.child
    if(childToParent) {
        parent = deployedBridgeInfo.child
        child = deployedBridgeInfo.parent
    }

    const caverChild = new Caver(child.url)
    const caverParent = new Caver(parent.url)
    const parentBridge = new caverParent.contract.create(bridgeAbi, parent.bridgeContract)
    const childBridge = new caverChild.contract.create(bridgeAbi, child.bridgeContract)
    const parentERC721 = new caverParent.contract.create(erc721Abi, parent.erc721)
    const childERC721 = new caverChild.contract.create(erc721Abi, child.erc721)
    const senderKeyring = caverParent.wallet.keyring.createFromPrivateKey(parent.key)
    const sender = caverParent.wallet.add(senderKeyring).address
    const recipientKeyring = caverChild.wallet.keyring.createFromPrivateKey(parent.key)
    const recipient = caverChild.wallet.add(recipientKeyring).address

    // mint nft first.
    var tokenId = 0
    const tokenURI = 'https://token.uri'
    var tokenExists = true

    // find non-exist token.
    while(tokenExists) {
        tokenId = parseInt(Math.random() * 100000)
        try {
            const owner = await parentERC721.methods.ownerOf(tokenId).call()
        } catch(err) {
            // The only revert reason is that the token does not exist.
            tokenExists = false 
        }
    }

    console.log(`minting an NFT (${tokenId})... `)
    await parentERC721.methods.mintWithTokenURI(sender, tokenId, tokenURI).send({from:sender, gas:1000000})

    console.log('check the NFT owner...')
    const owner = await parentERC721.methods.ownerOf(tokenId).call()
    if(owner.toLowerCase() !== sender.toLowerCase()) {
        throw `owner(${owner}) and sender(${sender}) is different!`
    }

    console.log('transferring NFT...')
    const r = await parentERC721.methods.requestValueTransfer(tokenId, recipient, []).send({from:sender, gas: 100000000})
    console.log("waiting 10 sec...")
    await sleep(10 * 1000)

    {
        console.log('check the NFT owner...')
        const owner = await childERC721.methods.ownerOf(tokenId).call()
        if(owner.toLowerCase() !== recipient.toLowerCase()) {
            throw `owner(${owner}) and sender(${sender}) is different!`
        }
    }

    // TODO: Need to fix this.
    // {
    //     console.log('check URI...')
    //     const uri = await childERC721.methods.tokenURI(tokenId).call()
    //     if(uri !== tokenURI) {
    //         throw `TokenURI is different! received:[${uri}], expected:[${tokenURI}]`
    //     }
    // }

    console.log("Successfully transferred!")
}

async function main() {
    var deployedBridgeInfoFilename = 'deployed_bridge_info.json'
    const myArgs = process.argv.slice(2);
    if (myArgs.length == 0) {
        console.log('using default deployedBridgeInfoFilename.')
    } else {
        deployedBridgeInfoFilename = myArgs[0]
    }
    console.log("deployedBridgeInfoFilename = " + deployedBridgeInfoFilename)

    const conf = JSON.parse(fs.readFileSync(deployedBridgeInfoFilename, 'utf8'));

    console.log("Testing KLAY transfer (parent to child)...")
    await TransferKLAY(conf, false)
    console.log("Testing KLAY transfer (child to parent)...")
    await TransferKLAY(conf, true)

    console.log("Testing ERC20 transfer (parent to child)...")
    await TransferERC20(conf, false)
    console.log("Testing ERC20 transfer (child to parent)...")
    await TransferERC20(conf, true)

    console.log("Testing ERC721 transfer (parent to child)...")
    await TransferERC721(conf, false)
    console.log("Testing ERC721 transfer (child to parent)...")
    await TransferERC721(conf, true)
}

main();