const Caver = require('caver-js');
const fs = require('fs')
const axiois = require('axios');
const { default: axios } = require('axios');

const bridgeAbi = JSON.parse(fs.readFileSync('build/Bridge.abi', 'utf8'));
const bridgeCode = fs.readFileSync('build/Bridge.bin', 'utf8');
const erc20Abi = JSON.parse(fs.readFileSync('build/ServiceChainToken.abi', 'utf8'));
const erc20Code = fs.readFileSync('build/ServiceChainToken.bin', 'utf8');
const erc721Abi = JSON.parse(fs.readFileSync('build/ServiceChainNFT.abi', 'utf8'));
const erc721Code = fs.readFileSync('build/ServiceChainNFT.bin', 'utf8');

async function deployBridge(info) {
    const caver = new Caver(info.url)
    const keyring = caver.wallet.keyring.createFromPrivateKey(info.key)
    const sender = caver.wallet.add(keyring).address
    const modeMintBurn = true
    var deployed = {}

    // check balance first
    const balance = await caver.rpc.klay.getBalance(sender)
    if(caver.utils.convertFromPeb(balance) < 1) {
        throw `[${info.ip}:${info.port}] insufficient balance of ${info.sender}: ${balance}`
    }

    try {
        // Deploy bridge
        const instanceBridge = new caver.contract.create(bridgeAbi);
        deployed = await instanceBridge.deploy({data: bridgeCode, arguments:[modeMintBurn]})
            .send({ from: sender, gas: 100000000, 
            value: caver.utils.toPeb(10000, 'KLAY')})
        console.log('deployed address: '+ deployed.options.address)

        console.log('Registering operator...')
        await deployed.methods.registerOperator(info.operator).send({ from: sender, gas: 100000000, value: 0 })

        // console.log('Transferring ownership...')
        // await deployed.methods.transferOwnership(info.operator).send({ from: sender, gas: 100000000, value: 0 })
    } catch (e) {
        console.log("Error:", e)
    }
    return deployed
}

async function DeployToken(info, abi, code) {
    const caver = new Caver(info.url)
    const keyring = caver.wallet.keyring.createFromPrivateKey(info.key)
    const sender = caver.wallet.add(keyring).address
    var deployed = {}

    // check balance first
    const balance = await caver.rpc.klay.getBalance(sender)
    if(caver.utils.convertFromPeb(balance) < 1) {
        throw `[${info.ip}:${info.port}] insufficient balance of ${info.sender}: ${balance}`
    }

    try {
        // Deploy bridge
        const token = new caver.contract.create(abi);
        deployed = await token.deploy({data: code, arguments:[info.bridgeContract]})
            .send({ from: sender, gas: 100000000})
        console.log('deployed address: '+ deployed.options.address)

        console.log("adding the bridge operator to the minter...")
        await deployed.methods.addMinter(info.operator).send({from:sender, gas: 100000000})

        console.log("adding the bridge contract to the minter...")
        await deployed.methods.addMinter(info.bridgeContract).send({from:sender, gas: 100000000})
    } catch (e) {
        console.log("Error:", e)
    }
    return deployed
}

async function RegisterToken(deployedBridgeInfo, registerToChild, key)
{
    var parent = deployedBridgeInfo.parent
    var child = deployedBridgeInfo.child
    if(registerToChild) {
        // swap parent and child
        parent = deployedBridgeInfo.child
        child = deployedBridgeInfo.parent
    }
    const caver = new Caver(parent.url)
    const keyring = caver.wallet.keyring.createFromPrivateKey(parent.key)
    const sender = caver.wallet.add(keyring).address

    const bridge = new caver.contract.create(bridgeAbi, parent.bridgeContract)
    await bridge.methods.registerToken(parent[key], child[key]).send({from: sender, gas: 1000000})
}

async function main() {
    var bridgeInfoFilename = 'bridge_info.json'
    const myArgs = process.argv.slice(2);
    if (myArgs.length == 0) {
        console.log('using default bridgeInfoFilename.')
    } else {
        bridgeInfoFilename = myArgs[0]
    }
    console.log("bridgeInfoFilename = " + bridgeInfoFilename)

    const conf = JSON.parse(fs.readFileSync(bridgeInfoFilename, 'utf8'));

    console.log("Deploying bridges...")
    const deployedParent = await deployBridge(conf.parent)
    const deployedChild = await deployBridge(conf.child)

    var deployedBridgeInfo = JSON.parse(JSON.stringify(conf))
    deployedBridgeInfo.parent.bridgeContract = deployedParent.options.address
    deployedBridgeInfo.child.bridgeContract = deployedChild.options.address

    // ERC20
    {
        console.log("Deploying ERC20 tokens...")
        const parentERC20 = await DeployToken(deployedBridgeInfo.parent, erc20Abi, erc20Code)
        const childERC20 = await DeployToken(deployedBridgeInfo.child, erc20Abi, erc20Code)

        deployedBridgeInfo.parent.erc20 = parentERC20.options.address
        deployedBridgeInfo.child.erc20 = childERC20.options.address

        console.log('registering ERC20 to the parent bridge...')
        await RegisterToken(deployedBridgeInfo, false, 'erc20')
        console.log('registering ERC20 to the child bridge...')
        await RegisterToken(deployedBridgeInfo, true, 'erc20')
    }

    // ERC721
    {
        console.log("Deploying ERC721 tokens...")
        const parentERC721 = await DeployToken(deployedBridgeInfo.parent, erc721Abi, erc721Code)
        const childERC721 = await DeployToken(deployedBridgeInfo.child, erc721Abi, erc721Code)

        deployedBridgeInfo.parent.erc721 = parentERC721.options.address
        deployedBridgeInfo.child.erc721 = childERC721.options.address

        console.log('registering ERC721 to the parent bridge...')
        await RegisterToken(deployedBridgeInfo, false, 'erc721')
        console.log('registering ERC721 to the child bridge...')
        await RegisterToken(deployedBridgeInfo, true, 'erc721')
    }

    fname = "deployed_"+bridgeInfoFilename
    console.log("Storing deployed information to " + fname)
    fs.writeFileSync(fname, JSON.stringify(deployedBridgeInfo, null, '  '))

    console.log('registering bridges to the child node')
    await axios.post(conf.child.url, {
        "jsonrpc":"2.0","method":"subbridge_registerBridge","params":[deployedBridgeInfo.child.bridgeContract, deployedBridgeInfo.parent.bridgeContract],"id":1
    })

    console.log('subscribing bridges to the child node')
    await axios.post(conf.child.url, {
        "jsonrpc":"2.0","method":"subbridge_subscribeBridge","params":[deployedBridgeInfo.child.bridgeContract, deployedBridgeInfo.parent.bridgeContract],"id":2
    })

    console.log('register token to subbridge..')
    await axios.post(conf.child.url, {
        "jsonrpc":"2.0","method":"subbridge_registerToken","params":[deployedBridgeInfo.child.bridgeContract, deployedBridgeInfo.parent.bridgeContract, deployedBridgeInfo.child.erc20, deployedBridgeInfo.parent.erc20],"id":2
    })

    console.log('Everything is done!')
}

main()