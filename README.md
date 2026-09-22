# Family Feud — Seeds Congress 2026 Edition

A Family Feud game show for Seeds Congress. It runs in the browser, with no install and no server.

- **Game:** `/` (the host runs the game from here)
- **Board display:** `/?view=board` is a clean board with no controls, for a projector. Open it from the host menu.
- **Admin:** `/admin/` is where you edit the questions, answers, teams, colours, logo and rules.

## Running a game

1. Open the site and press **Start the Game**.
2. **Face-off:** tap the answers the two players give, then pick which team won. That team chooses to play or pass.
3. **Play:** tap correct answers to reveal them. Press **Strike** (or `X`) for wrong ones.
4. **Steal:** after 3 strikes the other team gets one guess. Tap it if it's right, or press **Steal failed**.
5. **End of round:** the pot goes to the winner. Reveal the remaining answers, then go to the next question.

You can undo any step with `U`. The host menu (☰) lets you change scores, give the pot to a team, jump between questions and turn sound on or off.

**Projector setup:** open *Board display* from the host menu, drag that window to the projector and press `F` for fullscreen. Your own screen then shows the hidden answers faintly so you can judge guesses.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`8` | Reveal an answer |
| `X` | Strike |
| `A` / `B` | Team 1 / Team 2 wins the face-off |
| `R` | Reveal remaining answers |
| `N` | Next question |
| `U` | Undo |
| `H` | Show hidden answers to the host |
| `F` | Fullscreen |

## Editing content

Changes made in `/admin/` save to **that browser only**. To make them the default for everyone, go to **Save & Share → Download content.json** and replace `content.json` in this repo.
