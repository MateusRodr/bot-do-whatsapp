import 'dotenv/config';
import * as crypto from 'crypto';
(global as any).crypto = require('crypto');

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'connecting') {
      console.log('Conectando ao WhatsApp...');
    }

    if (connection === 'open') {
      console.log('✅ Conectado com sucesso!');
    }

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão encerrada. Reconectando?', shouldReconnect);
      if (shouldReconnect) startBot();
      else console.log('Usuário deslogado. Escaneie o QR novamente.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      const from = msg.key.remoteJid ?? '';

      // Ignora mensagens de grupos e do próprio bot
      if (!from.endsWith('@s.whatsapp.net') || msg.key.fromMe) continue;

      // Ignora mensagens muito antigas (30 segundos ou mais)
      if (!msg.messageTimestamp || (Date.now() / 1000 - Number(msg.messageTimestamp)) > 30) continue;

      const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const text = content.toLowerCase().trim();

      // Palavras que iniciam o atendimento
      const palavrasChave = ['oi', 'olá', 'menu', 'iniciar', 'ajuda'];

      // Se for uma palavra-chave, mostra o menu
      if (palavrasChave.includes(text)) {
        await sock.readMessages([{ remoteJid: from, id: msg.key.id! }]);

        await sock.sendMessage(from, {
          text: `👋 Olá! Bem-vindo à *Academia X*!\nEscolha uma opção:\n\n1️⃣ Planos\n2️⃣ Produtos\n3️⃣ Marcar Avaliação\n4️⃣ Falar com Atendente\n\nResponda apenas com o número da opção.`,
        });
        continue;
      }

      // Se não for uma das opções numéricas, ignora
      if (!['1', '2', '3', '4'].includes(text) && !text.includes('quero agendar')) continue;

      // Marca a mensagem como lida
      await sock.readMessages([{ remoteJid: from, id: msg.key.id! }]);

      // Respostas conforme a opção escolhida
      switch (text) {
        case '1':
          await sock.sendMessage(from, {
            text: `📋 *Nossos Planos:*\n\n🏋️ Individual: R$ 89,90/mês\n👫 Casal: R$ 149,90/mês\n👨‍👩‍👧‍👦 Família (até 4 pessoas): R$ 199,90/mês\n👴 Melhor idade (60+): R$ 69,90/mês`,
          });
          break;
        case '2':
          await sock.sendMessage(from, {
            text: `🛒 *Produtos à venda:*\n\n💪 Whey Protein - R$ 149,90\n⚡ Creatina - R$ 89,90\n🍚 Hipercalórico - R$ 129,90\n🥤 Coqueteleira - R$ 29,90`,
          });
          break;
        case '3':
          await sock.sendMessage(from, {
            text: `📅 *Horários disponíveis para avaliação física:*\n\n✅ Segunda a Sexta:\n - 08:00\n - 10:30\n - 14:00\n - 17:30\n\n💰 Valor: R$ 39,90\n\nPara agendar, envie:\n*Quero agendar às [horário]*`,
          });
          break;
        case '4':
          await sock.sendMessage(from, {
            text: `📞 Um de nossos atendentes falará com você em breve.\n\nSe for urgente, envie *URGENTE*.`,
          });
          break;
        default:
          if (text.includes('quero agendar')) {
            await sock.sendMessage(from, {
              text: `✅ Agendamento recebido!\nVamos verificar a disponibilidade e confirmar com você em breve.`,
            });
          }
          break;
      }
    }
  });
}

startBot();
