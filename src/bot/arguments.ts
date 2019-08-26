/**
 * Created by Pointless on 16/07/17.
 */
import * as discord from 'discord.js';

export type ArgedMessage = discord.Message & {args: Arguments};

class Arguments extends Array<string> {
  public static parse(message: discord.Message) {
    const words = message.content.split(' ');
    let commandIndex = 1; // Quick hack to allow for extra spaces between mention and command
    while (words[commandIndex] === '' && commandIndex < words.length) commandIndex ++;
    const command = words[commandIndex];
    const args = words.slice(commandIndex + 1);

    return new Arguments(message, command, args);
  }
  constructor(
    public message: discord.Message,
    public command: string,
    private args: string[],
  ) {
    super(...(args || []));
  }

  public from(position: number): string {
    return this.args.slice(position).join(' ');
  }
}

export default Arguments;
