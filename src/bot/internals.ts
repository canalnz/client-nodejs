/* Heavily based on https://github.com/PointlessDev/DiscordScriptBot */
import {ArgedMessage} from './arguments';
import {Message} from 'discord.js';
import {hostname} from 'os';
import Bot from './index';

interface CommandAnnotation {
  triggers?: string[];
  description: string;
  usage?: string;
}
interface Command {
  name: string;
  triggers: string[];
  description?: string;
  usage?: string;
  handlerName: string;
}
export type CommandHandler = (message: ArgedMessage) => Promise<void> | void;

function Command(data: CommandAnnotation) {
  return (target: Internals, propertyKey: keyof Internals) => {
    target.index = target.index || {};
    target.commands = target.commands || [];

    const triggers = data.triggers || [propertyKey];

    const collision = triggers.find((t) => !!target.index[t]);
    if (collision) {
      throw new Error(`Internal command trigger collision: Internals.${propertyKey} is trying to register a ` +
        `trigger, but ${collision} already has!`);
    }
    const command: Command = {
      name: triggers[0],
      triggers,
      description: data.description,
      usage: data.usage,
      handlerName: propertyKey
    };
    triggers.forEach((trigger) => target.index[trigger] = propertyKey);
    target.commands.push(command);
  };
}

export async function fail(message: Message, reason?: string): Promise<Message|Message[]> {
  return message.channel.send('❌: ' + (reason || 'Failed due to an unknown reason'));
}
export async function succeed(message: Message, reason: string = 'Done!'): Promise<Message|Message[]> {
  return message.channel.send('✅: ' + reason);
}

export default class Internals {
  public index!: {[propName: string]: keyof Internals};
  public commands!: Command[];

  constructor(private bot: Bot) {}
  public disable(match: string[]): void {
    match.forEach((m) => {
      delete this.index[m]; // TODO globbing
    });
  }
  public dispatch(message: ArgedMessage): void {
    const key = this.index[message.args.command];
    if (!key) return;
    (this[key] as CommandHandler)(message);
  }

  @Command({
    description: 'This command. Lists all available internal commands',
    usage: '[command]'
  })
  public async help(message: ArgedMessage): Promise<void> {
    this.bot.canal.debug('Internals', 'Help called. We use includes here');
    const command = message.args[0];
    const info = this.commands.find((c) => c.triggers.includes(command));
    if (command && !info) {
      await fail(message, 'That command does not exist! Run `@Bot help` to see all commands');
      return;
    } else if (command && info) {
      const fields = [
        {
          inline: true,
          name: 'usage:',
          value: `@Bot ${info.triggers[0]} ${info.usage || ''}`
        }
      ];
      if (info.triggers.length > 1) {
        fields.push({
          inline: true,
          name: 'aliases:',
          value: info.triggers.slice(1).join(', ')
        });
      }

      message.channel.send({embed: {
          color: 0x4CAF50,
          description: info.description,
          fields,
          title: '`' + info.triggers[0] + '`',
        }});
    } else {
      message.channel.send({embed: {
          fields: this.commands.map((c) => ({
            name: c.triggers[0] + ' ' + (c.usage || ''),
            value: c.description
          })),
          title: 'Canal Nodejs Client - Internal Commands'
        }});
    }
  }

  @Command({
    description: 'Prints info about the bot'
  })
  public async status(message: ArgedMessage): Promise<void> {
    await message.channel.send({embed: {
        color: 0x4CAF50,
        description: 'Slim client backed by Canal, a powerful script management system. May contain peanuts.',
        fields: [
          {
            inline: true,
            name: 'Node.js',
            value: process.version
          },
          {
            inline: true,
            name: 'Client version',
            value: require('../../package.json').version
          },
          {
            inline: true,
            name: 'Env',
            value: `\`${process.env.NODE_ENV}\``
          },
          {
            inline: true,
            name: 'Host',
            value: hostname()
          }
        ],
        author: {
          name: 'Canal Nodejs Client',
          url: 'https://canal.nz',
          icon_url: 'https://canal.nz/static/img/icon-small.png'
        },
        footer: {
          text: 'Built by Canal with <3'
        }
      }});
  }

  @Command({
    description: 'Forcefully shuts down the bot!',
    triggers: ['shutdown', 'forceshutdown', 'fuckfuckfuck']
  })
  public shutdown(): void {
    console.error('[FATAL] Forcefully shutting down!', new Date());
    process.exit(0); // Don't bother with confirmation, may be urgent or something
  }

  @Command({
    description: 'List scripts that are bound to this bot'
  })
  public async list(message: ArgedMessage): Promise<void> {
    const scripts = this.bot.activeScripts;
    const nameList = scripts.map((s) => `${s.isPassive ? '👂' : '⚙️'} ${s.name}\n`);

    const maxLen = 20;
    if (scripts.length > maxLen) {
      const amount = nameList.length - maxLen;
      nameList.slice(0, maxLen);
      nameList.push(`\n ... ${amount} more`);
    }
    message.channel.send(`${scripts.length} scripts.\`\`\`${nameList.join('')}\`\`\``);
  }
}
