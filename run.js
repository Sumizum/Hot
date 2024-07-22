const { connect, Account, InboundCall, utils } = require('near-api-js');
const { KeyPairEd25519 } = require('near-api-js');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const moment = require('moment');
const figlet = require('figlet');
const winston = require('winston');
const TelegramBot = require('node-telegram-bot-api');
const { decodeBase64 } = require('base64-js');
const zlib = require('zlib');

// Configuration
const config = require('./config.json');

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Telegram Bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// NEAR Connection
const near = connect(
  config.rpcUrl,
  {
    networkId: config.networkId,
    headers: {},
    keyStore: new KeyStore(),
    nodeUrl: config.rpcUrl
  }
);

// KeyStore class
class KeyStore {
  constructor() {
    this.keys = {};
  }

  async getKey(accountId) {
    return this.keys[accountId];
  }

  async setKey(accountId, key) {
    this.keys[accountId] = key;
  }
}

// Function to claim HOT tokens
async function claimHot(accountId, privateKey) {
  try {
    const account = new Account(near, accountId, KeyPairEd25519.fromString(privateKey));
    const balance = await account.account_balance();
    if (parseFloat(balance) >= 0.001) {
      logger.info(`Claiming HOT for ${accountId}...`);
      const result = await account.functionCall(
        config.claimContractId,
        'claim',
        {},
        300000000000000,
        utils.format.parseNearAmount('0.001')
      );
      logger.info(`Claim successful for ${accountId}!`);
      if (config.telegramNotification) {
        bot.sendMessage(config.telegramUserId, `Claim successful for ${accountId}`);
      }
    } else {
      logger.info(`Insufficient balance for ${accountId}`);
      if (config.telegramNotification) {
        bot.sendMessage(config.telegramUserId, `Insufficient balance for ${accountId}`);
      }
    }
  } catch (error) {
    logger.error(`Error claiming HOT for ${accountId}: ${error}`);
    if (config.telegramNotification) {
      bot.sendMessage(config.telegramUserId, `Error claiming for ${accountId}: ${error}`);
    }
  }
}

// Function to load accounts from accounts.txt
async function loadAccounts() {
  try {
    const accounts = [];
    const data = await require('fs').promises.readFile('accounts.txt', 'utf8');
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.trim() !== '') {
        const [privateKey, accountId] = line.split('|');
        accounts.push({ privateKey, accountId });
      }
    }
    return accounts;
  } catch (error) {
    logger.error('Error loading accounts:', error);
    process.exit(1);
  }
}

// Function to start the bot
async function startBot() {
  try {
    figlet.text('HOT Claim Bot', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    }, function(err, data) {
      if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
      }
      console.log(data);
    });

    // Load accounts from accounts.txt
    const accounts = await loadAccounts();

    // Main loop
    setInterval(async () => {
      for (const account of accounts) {
        await claimHot(account.accountId, account.privateKey);
      }
      logger.info(`Claiming cycle completed at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    }, 60000); // Claim every minute
  } catch (error) {
    logger.error('Error starting bot:', error);
    process.exit(1);
  }
}

// Check for password
readline.question('Enter password: ', (password) => {
  if (password === config.password) {
    startBot();
  } else {
    console.log('Incorrect password!');
    process.exit(1);
  }
});
