export interface GuideStep {
  title: string;
  text: string;
}
export const ROOM_GUIDES = {
  camp: [
    {
      title: 'Move and practice',
      text: 'Move with WASD, a gamepad left stick, or the on-screen MOVE stick. Attack the training dummy to try your abilities safely.',
    },
    {
      title: 'Choose your hero',
      text: 'Class effigies (H on phones) change your class when you stand near them. Approach one to read its name, or use the Hero picker in Menu.',
    },
    {
      title: 'Host or join',
      text: 'Host creates a room for friends or bots. Join opens the room-code form. Walk onto either totem, or use the menu buttons.',
    },
    {
      title: 'Controls and abilities',
      text: 'Aim with the mouse or AIM stick; use the labeled ability buttons. The Controls totem or menu explains inputs and lets you rebind them.',
    },
  ],
  host: [
    {
      title: 'Choose a boss',
      text: 'Use the Easy, Medium, or Hard gates to browse. Approach a boss effigy (B on phones) for the boss name; stand there to choose it for a single fight.',
    },
    {
      title: 'Single or gauntlet',
      text: 'Single chooses one fight. Gauntlet (Run on phones) chooses a five-boss gauntlet with upgrades between bosses; its bosses are drawn from the run seed.',
    },
    {
      title: 'Optional modifiers',
      text: 'Hardcore (HC) adds difficulty. Chaos Forge and Chaos Draft change content or kits. Run of the Day (Daily) shares a seed. Approach a rune to read its setting.',
    },
    {
      title: 'Raise your banner',
      text: 'Stand in the Host / Raise Your Banner portal to create the room. Camp options edits your name; List view keeps all settings and the Create Room button available.',
    },
  ],
  lobby: [
    {
      title: 'Your band and controls',
      text: 'Move with WASD, a gamepad left stick, or MOVE on touch. The lobby menu shares the room code and invite link.',
    },
    {
      title: 'Bot · Add teammates',
      text: 'The host can stand on a Bot effigy to add that class. Approach to read the class name. The lobby menu has the same bot controls.',
    },
    {
      title: 'Remove a bot',
      text: 'The host can stand on a bot’s removal marker in the band row (− on phones) to send it home. Human teammates are not removed by these markers.',
    },
    {
      title: 'Ready, then Start',
      text: 'Stand on Ready to ready up; step off and back on to stand down. Once everyone is ready, the host uses Start or the war-horn. The menu buttons work too.',
    },
    {
      title: 'When the fight starts',
      text: 'Aim with the mouse or AIM stick. Attack with left-click, Space, or Basic; use Q/E/R or the ability buttons. Hold F or Revive near a downed teammate.',
    },
  ],
} satisfies Record<string, readonly GuideStep[]>;
