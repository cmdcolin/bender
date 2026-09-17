# Changelog

All notable changes to bender are documented here.

## [1.0.4](https://github.com/cmdcolin/bender/compare/v1.0.3...v1.0.4) - 2026-09-17

### Features
- *(ui)* [`5a3caf8`](https://github.com/cmdcolin/bender/commit/5a3caf8b1044430ed73212ded75c134131583082) mark each slider's normal range and let the knob run past it
- *(dsp)* [`be01c1b`](https://github.com/cmdcolin/bender/commit/be01c1b26795e9c025b47516c27b610660412fa7) add an output drive to the FM chip
- *(ui)* [`34df032`](https://github.com/cmdcolin/bender/commit/34df03267446e8d9e45b58ef2ec795ded621e792) tickle the talking pet with a click

### Fixes
- *(ui)* [`3aad637`](https://github.com/cmdcolin/bender/commit/3aad637e592136ad6916ecb0753a4eb4f96532c7) shiver the pet only while it is scared

### Performance
- *(ui)* [`e68fc67`](https://github.com/cmdcolin/bender/commit/e68fc679bb699f36d4e8b2195d1a5c0e40fc58e4) redraw only the kit lamps on a step and the changed pads on a hit

### Documentation
- [`e3dc4d3`](https://github.com/cmdcolin/bender/commit/e3dc4d379074a5bc000aca9c7cd4b725727df232) regenerate the panel figure with the drum kit beside the keyboard

## [1.0.3](https://github.com/cmdcolin/bender/compare/v1.0.2...v1.0.3) - 2026-09-16

### Features
- *(ui)* [`236de83`](https://github.com/cmdcolin/bender/commit/236de83537340e6a851c37c24dcb22b91aac5282) swap the diagram's off-stock count for a touched dot

### Fixes
- *(ui)* [`0cebe52`](https://github.com/cmdcolin/bender/commit/0cebe52eb6a760c703d916ddad2cb82f74f704c9) open a link that picked up a character on the way
- *(ui)* [`5a6fffb`](https://github.com/cmdcolin/bender/commit/5a6fffb10eaaebab4c7a5c4cfa1003d281027e1b) let the start button on a board somebody sent start it
- *(ui)* [`dd00ca6`](https://github.com/cmdcolin/bender/commit/dd00ca6f4cdb8a323b2d06c275f9952d99df1f3a) open a slider's tooltip from its label only

### Documentation
- [`11c6460`](https://github.com/cmdcolin/bender/commit/11c6460a226f9ebd21ac4d4e3a96e3d89e7c7afa) describe pnpm arrive in the script table

### Tests
- *(ui)* [`622780f`](https://github.com/cmdcolin/bender/commit/622780f3ec92c74b1c5f26d69e677d078f776be5) drive a board arriving from a link in a real browser

### Chores
- *(ui)* [`7949137`](https://github.com/cmdcolin/bender/commit/79491372a6b441d5ec451343f6095308212abc1a) mark the base64 reader as shared with videoskillet

## [1.0.2](https://github.com/cmdcolin/bender/compare/v1.0.1...v1.0.2) - 2026-09-16

### Features
- *(engine)* [`e78435b`](https://github.com/cmdcolin/bender/commit/e78435bb977d394745374c1d9d88096930b3b232) report the pet's mood, phrase, motor speed and speech level on the meter
- *(ui)* [`61121f9`](https://github.com/cmdcolin/bender/commit/61121f9eeff04b4fa4361ed24df133c6847bdc6c) draw the toy drum kit, a circuit-board FM keyboard and the talking pet

### Documentation
- *(ui)* [`31fbf7b`](https://github.com/cmdcolin/bender/commit/31fbf7beeb214b4c9b236da6859dd5024af547d2) describe the account control, and plain up the prose around it

## [1.0.1](https://github.com/cmdcolin/bender/compare/v1.0.0...v1.0.1) - 2026-09-16

### Features
- *(ui)* [`27e121b`](https://github.com/cmdcolin/bender/commit/27e121ba94d3c00d7a87356ba0d20691dab17d63) set the App Check key, so sessions start attesting
- *(home)* [`d8b3ffc`](https://github.com/cmdcolin/bender/commit/d8b3ffc61ad842d513c1f9a4546d9e7c48ea5e03) put the demos at the foot of the page, as clips
- *(home)* [`df88d44`](https://github.com/cmdcolin/bender/commit/df88d446fb65dd0c9719b2b2c5d899b235091e6e) render the demo clips 24 seconds long, up from 15
- *(ui)* [`ad0caaa`](https://github.com/cmdcolin/bender/commit/ad0caaa10a2222c6e20d7cd9d57d549db7849228) give the account its own control, with the avatar on it
- *(ui)* [`ae0a760`](https://github.com/cmdcolin/bender/commit/ae0a760ce9168d9cc230e111d4e34bedfff9f958) replace the reverb's Dry cut with a Dry level that starts at full

### Fixes
- *(ui)* [`d0a2ad4`](https://github.com/cmdcolin/bender/commit/d0a2ad48034cf2f7a250f3155005067815f686df) attest with reCAPTCHA Enterprise, which is what the console offers

### Chores
- [`acf1439`](https://github.com/cmdcolin/bender/commit/acf143913562f8c846efc5c07b2cf7955a9d1959) install ffmpeg in the deploy build for the demo reel

## [1.0.0](https://github.com/cmdcolin/bender/compare/v0.20.5...v1.0.0) - 2026-09-16

### Features
- *(home)* [`9332291`](https://github.com/cmdcolin/bender/commit/933229129938905b3bb57fab8196b9a9a82e4323) show the README's demos on the home page instead of every preset
- *(home)* [`d3c7027`](https://github.com/cmdcolin/bender/commit/d3c7027ff516910c8e06aec8dfd1b3b848baf7fc) a Listen showcase of rendered demo clips on the landing page
- *(ui)* [`cfcee3c`](https://github.com/cmdcolin/bender/commit/cfcee3ccb40e62e78d6787b78f4d2009343eef02) expose window.bender, a scripting API for browsing agents
- *(ui)* [`4521182`](https://github.com/cmdcolin/bender/commit/45211824dbf026fd2b4f445fea4dcb7117112bf1) ask before loading Google Analytics
- *(home)* [`7a635a3`](https://github.com/cmdcolin/bender/commit/7a635a34072f6f01df390269787fd7fcce3b8ac1) copy, rename and delete a voice from the home page
- *(home)* [`334d5cf`](https://github.com/cmdcolin/bender/commit/334d5cf3638b4b133e85b5b0ae7641cf83618808) a board of the day at the head of the demos
- *(ui)* [`5489c28`](https://github.com/cmdcolin/bender/commit/5489c287706c79708257c3304a49efe1c6950841) wire App Check, inert until a site key is registered
- *(dsp)* [`6bc816d`](https://github.com/cmdcolin/bender/commit/6bc816d31408a1f56a6f37d1e6c03219f1308d07) talking pet source with an LPC speech chip, phrase ROM and cam motor
- *(ui)* [`1494ba8`](https://github.com/cmdcolin/bender/commit/1494ba84d4d783969277a39977dfa55a4cdc42fe) talking pet panel, desk strip, patch bay lanes and map box

### Fixes
- *(ui)* [`2bd5928`](https://github.com/cmdcolin/bender/commit/2bd5928c2c2459d6d93c73019c4665cb79a22408) stop a quick second save from erasing the first
- *(ui)* [`57050cc`](https://github.com/cmdcolin/bender/commit/57050ccc73a60644f5bd9eccc645c198131c545e) stop writing on recall, and retry a failed SDK download
- *(home)* [`411764f`](https://github.com/cmdcolin/bender/commit/411764fa71fc0424df644824451dc46b69c8f280) say why a sign-in failed, and keep the resume card on your own board
- *(dsp)* [`05edb0f`](https://github.com/cmdcolin/bender/commit/05edb0f2377ca4453fb711e743b5451b51a8b621) recompute the toy chip envelope decay when the step rate changes
- *(ui)* [`e7958ae`](https://github.com/cmdcolin/bender/commit/e7958aeb4b55f95d1a665ed46a3777bf18899792) measure only audio after the listen call in bender.listen
- *(ui)* [`8b4885d`](https://github.com/cmdcolin/bender/commit/8b4885de3b650d3e397f435761d88f11b75e77bd) say why a save failed, and drop replies that arrive after sign-out
- *(home)* [`8780de4`](https://github.com/cmdcolin/bender/commit/8780de4cc03c386bf4f5d4fef74d85433e54d8ff) a card edit that lands after sign-out draws nothing, and its failure blames nobody
- *(ui)* [`c25f038`](https://github.com/cmdcolin/bender/commit/c25f03845f3a884f037fc95032fc0de0555400d8) split bender.help into short guide topics, and rank named groups first in find
- *(ui)* [`b6fd308`](https://github.com/cmdcolin/bender/commit/b6fd3083159b9eea079a73f5e5666afeea4b132c) keep find results under the browser tool's string limit
- *(ui)* [`93d7663`](https://github.com/cmdcolin/bender/commit/93d7663c8a4d5fae3e791102dbc95cc78daeebb3) recover sign-in after a failed SDK load or list fetch, and keep held saves in step
- *(ui)* [`224e3b4`](https://github.com/cmdcolin/bender/commit/224e3b4e46d8e7db40e169f34fab1fc2b9f68daa) paint the home page after a sign-in when the auth subscription failed to load
- *(dsp)* [`429f639`](https://github.com/cmdcolin/bender/commit/429f639519644f92519989246c7367db322521ea) keep a chatty pet awake in a quiet room
- *(ui)* [`885ecbc`](https://github.com/cmdcolin/bender/commit/885ecbc2245f00c4c0e1fae834876e018ebf7c45) draw patch wires onto every destination's box on the map

### Documentation
- [`56e67d5`](https://github.com/cmdcolin/bender/commit/56e67d5376828fec83a8dc37693f2b12226a9468) document window.bender for Claude in Chrome and Claude Code
- [`773ae99`](https://github.com/cmdcolin/bender/commit/773ae99e0bd70931013397cf2769f756cb98a71c) record the Claude in Chrome eval results in agent-interface.md
- [`de45764`](https://github.com/cmdcolin/bender/commit/de45764ae393ee32ba2211942029106fb2d99ec0) say what a resume cannot bring back, and document the card verbs
- [`eba2b2b`](https://github.com/cmdcolin/bender/commit/eba2b2b8103027f900db978f8732f57b6eb3a3b6) add a Claude in Chrome screenshot to the AI usage page
- *(ui)* [`25e6b6e`](https://github.com/cmdcolin/bender/commit/25e6b6e0f77edb55a2bc41eb48032a963c2b628e) describe the talking pet in the guide, bends and features

### Tests
- [`d027768`](https://github.com/cmdcolin/bender/commit/d02776806e9972d9ab5920d3016e26e78625ec24) add pnpm agent, and check that the chord lane goes quiet after stop
- [`c14fa3d`](https://github.com/cmdcolin/bender/commit/c14fa3d72602058e72511395abc2123c1e0d327d) add pnpm agent:eval, which grades claude -p --chrome sessions against the app
- *(dsp)* [`2956f9b`](https://github.com/cmdcolin/bender/commit/2956f9bd5511ff85191ce3570f7444acd666b22f) hold the talking pet to its lattice bounds, moods and rail load

## [0.20.5](https://github.com/cmdcolin/bender/compare/v0.20.4...v0.20.5) - 2026-09-15

### Features
- *(ui)* [`eb94f94`](https://github.com/cmdcolin/bender/commit/eb94f9481df0475a3effb535c67629cf9a2eacbe) put the home page in the why-sign-in card, and lighten the prose

### Other Changes
- [`2c3ecb9`](https://github.com/cmdcolin/bender/commit/2c3ecb9faad9a83681f5a74cad27c7f5afef0373) Rename source to github

## [0.20.4](https://github.com/cmdcolin/bender/compare/v0.20.3...v0.20.4) - 2026-09-15

### Features
- *(ui)* [`58244cb`](https://github.com/cmdcolin/bender/commit/58244cbf1c621620315c39de28b211452638a434) take videoskillet's site bar, footer and site styles

### Fixes
- *(docs)* [`fe3bdf5`](https://github.com/cmdcolin/bender/commit/fe3bdf5e02809cc49ce45bb53c89b52dcd660268) drop the stale duplicate format entry from the features script
- *(lint)* [`f772c91`](https://github.com/cmdcolin/bender/commit/f772c915b7b5b8b2ec24487a169227dec9bc89ff) clear every oxlint diagnostic
- *(ui)* [`9bb99ae`](https://github.com/cmdcolin/bender/commit/9bb99ae4f1c92bdd9efc29cd4596e40b43163757) stop personifying the account as something that holds data

### Refactor
- *(ui)* [`baa5afd`](https://github.com/cmdcolin/bender/commit/baa5afd4a60988597c84a5dbc2dbf5bfba015f39) take the neutrals and type scale from the shared tokens.css

### Chores
- [`5da9160`](https://github.com/cmdcolin/bender/commit/5da916050361e1b93e4ca5112ac4a379bc49d987) adopt videoskillet's lint, format, hook and changelog tooling

### Other Changes
- [`6b6e0b6`](https://github.com/cmdcolin/bender/commit/6b6e0b6fbb462cf3f5dd2c9a179a40bd177a9022) Give the user guide its own page instead of a GitHub link
- [`d4d39aa`](https://github.com/cmdcolin/bender/commit/d4d39aa661426470906536d219cd2ba546f3aeef) Add cross-repo sync with videoskillet

## [0.20.3](https://github.com/cmdcolin/bender/compare/v0.20.2...v0.20.3) - 2026-09-15

### Other Changes
- [`42cbaf1`](https://github.com/cmdcolin/bender/commit/42cbaf1818d5c5a1e96ab6f84e264882f4c5e4e8) Add a favicon: a bent wire between two solder pads
- [`29b7fde`](https://github.com/cmdcolin/bender/commit/29b7fdefec7129203f33016dd71b415930314047) Harden the signed-in home's wait
- [`cc6913a`](https://github.com/cmdcolin/bender/commit/cc6913a32cad8e1a23470a8e2016b8fc27d88864) Swap the favicon for a glitched speaker

## [0.20.2](https://github.com/cmdcolin/bender/compare/v0.20.1...v0.20.2) - 2026-09-15

### Other Changes
- [`7e0db6f`](https://github.com/cmdcolin/bender/commit/7e0db6f0ee449c02dc74469549cbf928d149749b) Disable HTML minifier

## [0.20.1](https://github.com/cmdcolin/bender/compare/v0.20.0...v0.20.1) - 2026-09-15

### Other Changes
- [`3c74a70`](https://github.com/cmdcolin/bender/commit/3c74a7098279eab8b93addcdbfe2cbf921587ead) Point the empty library at the save button
- [`0a8a6b2`](https://github.com/cmdcolin/bender/commit/0a8a6b2fac0330d9e159a96c7ad47f7bafbfc2e4) Show a skeleton home to browsers that have signed in before

## [0.20.0](https://github.com/cmdcolin/bender/compare/v0.19.0...v0.20.0) - 2026-09-15

### Other Changes
- [`96827e9`](https://github.com/cmdcolin/bender/commit/96827e9b1345b1e727136ead4b8ef2e373f88e9b) Explain the body contact pad with a Tip
- [`2514b68`](https://github.com/cmdcolin/bender/commit/2514b681d6ac3621eff3fdcfd09e035c1b1d542b) Add a hamburger menu with an About entry
- [`07088ed`](https://github.com/cmdcolin/bender/commit/07088edba38b0251ac06673ce2e16d9891eda85f) Update chain map
- [`d26dc73`](https://github.com/cmdcolin/bender/commit/d26dc7319151f5007c86a551d8ca865d2e93a521) Explain why signing in is worth it, and put save in the panel
- [`42f2f32`](https://github.com/cmdcolin/bender/commit/42f2f324035e52aa2883c7f5899ccf7d6873caf2) Cut the why-sign-in card to two sentences, and align it with videoskillet

## [0.19.0](https://github.com/cmdcolin/bender/compare/v0.18.0...v0.19.0) - 2026-09-15

### Other Changes
- [`bbe4156`](https://github.com/cmdcolin/bender/commit/bbe4156ed0ea52d52deef1c356d614b10df808fb) Misc

## [0.18.0](https://github.com/cmdcolin/bender/compare/v0.17.7...v0.18.0) - 2026-09-15

### Other Changes
- [`00a77e2`](https://github.com/cmdcolin/bender/commit/00a77e2b4fd6034846c8c22aedd4a2befbfd4337) Keep a board under a name, on an account rather than on this machine
- [`c2f6c1e`](https://github.com/cmdcolin/bender/commit/c2f6c1e35989c95b8e499e88763502f3e9c8a2f8) Give the app a front door, and move the app itself to /app/
- [`563ce25`](https://github.com/cmdcolin/bender/commit/563ce256dc4df1488141d2bd4908b6e10d556be1) Say where the app is now, and what an account holds
- [`59cce85`](https://github.com/cmdcolin/bender/commit/59cce850b5457371f7278a0e3ccc83d43f21aeac) Build the site with Astro
- [`b2f7807`](https://github.com/cmdcolin/bender/commit/b2f78078f13e1b5b4432c127817fa82883defe41) Give the bay nine more lanes: six faders, resonance, FM brightness, loop time
- [`75a0368`](https://github.com/cmdcolin/bender/commit/75a0368668ae8695f556eeced0fc0dc97fb966fd) Clock the bucket brigade, splice the tape loop, and let the kit kick the amp
- [`7eb0303`](https://github.com/cmdcolin/bender/commit/7eb030353cb4baf2bc5be4fe442459925aa5048d) Let bay wires move the knife: every bus line and fault select is a lane
- [`cf1fac6`](https://github.com/cmdcolin/bender/commit/cf1fac67cce5abba691423e51812d6d35f17a332) A hold mode that goes round the last hit, three heads on the tape, and the comb in tune
- [`76de1ff`](https://github.com/cmdcolin/bender/commit/76de1ffc09396eaff702d2b7ea5bb6b293f077f1) Three more for the pedals to try
- [`ec2b9b7`](https://github.com/cmdcolin/bender/commit/ec2b9b7388acbb602a170bab353ec9d99f5e2d0d) Solder the shift register onto the melody side, and light the map off the bus
- [`0601e9e`](https://github.com/cmdcolin/bender/commit/0601e9e4196dc896128e6eadaeb7e6aac0faedaa) Measure the new wires, name two cuts on them, and test the lot
- [`e351438`](https://github.com/cmdcolin/bender/commit/e3514383ead4306ad4d3371a41a43163cb9e93af) Write down what the chip can do now
- [`30236eb`](https://github.com/cmdcolin/bender/commit/30236ebd095dbe13fdc41325d16c41c8218954b9) Keep the trigger patch reachable when only the chip's wire is in the lane
- [`22044ae`](https://github.com/cmdcolin/bender/commit/22044ae5cd230d4a18d66b5ecbaba2ac517f475c) Put the table's output pins in the bay with the other knife selectors
- [`f77d21b`](https://github.com/cmdcolin/bender/commit/f77d21b3c0fc869ff9a43bdc2205b768c9d9fbbf) Say fifty-four, and say what the bay reaches on this chip
- [`77cde6b`](https://github.com/cmdcolin/bender/commit/77cde6becf39de98c96851b7639cac0f96db6cdf) Measure four more places for the ring mod's multiplier
- [`01a46e8`](https://github.com/cmdcolin/bender/commit/01a46e8c48ef3485763ce4622daa73c41638c8ac) Put the ring mod's mix on the patch bay
- [`a252b2f`](https://github.com/cmdcolin/bender/commit/a252b2fd569a5f492840c7ede949a8c631d168b0) Lock the ring mod's carrier to the sequencer
- [`b8baaa5`](https://github.com/cmdcolin/bender/commit/b8baaa5afbed5ebcb66f15b2ea207dfbe054d095) Let another machine make the ring mod's carrier
- [`8e9bf24`](https://github.com/cmdcolin/bender/commit/8e9bf245908dfb3441bb90dd7a3115c3683f1914) Put a multiplier inside the tape delay's regeneration
- [`ea8fcb0`](https://github.com/cmdcolin/bender/commit/ea8fcb0013ce063f3671b6158c2ac254662ac521) Say where the carrier bus comes from, in the loop that fills it

## [0.17.7](https://github.com/cmdcolin/bender/compare/v0.17.6...v0.17.7) - 2026-09-09

### Other Changes
- [`5dae7d1`](https://github.com/cmdcolin/bender/commit/5dae7d14914307a723d28330ff8fc454ae7814e1) Wire the cap onto the output, and lid the parts nobody hears
- [`e1fd6da`](https://github.com/cmdcolin/bender/commit/e1fd6da8fe92fc102b6ef1f0e75d1cad89857a1e) pnpm audible: take each branch of the kit out and see if anyone notices
- [`4b55272`](https://github.com/cmdcolin/bender/commit/4b5527280263485bc21bab141b87b1b6b072121c) Why the squarer's third state stays

## [0.17.6](https://github.com/cmdcolin/bender/compare/v0.17.5...v0.17.6) - 2026-09-08

### Other Changes
- [`07c4884`](https://github.com/cmdcolin/bender/commit/07c48842d3d0cf8e81bdf97ed2ba53fa3fdd7c6e) One button height for a finger, and no shortcuts it can't press
- [`ca20b9d`](https://github.com/cmdcolin/bender/commit/ca20b9dd075fd4a713afa2b935f1caf1e6261f7b) Pin the panel's chrome and give phones a one-line transport row
- [`cb65d7d`](https://github.com/cmdcolin/bender/commit/cb65d7daa4f74fb60f5a9164422af2d9361c534d) Reach the bay from the row it lands on, and tap the speeds a hand keeps

## [0.17.5](https://github.com/cmdcolin/bender/compare/v0.17.4...v0.17.5) - 2026-08-31

### Other Changes
- [`1994b52`](https://github.com/cmdcolin/bender/commit/1994b529603a9d5ff7d05fac6879b645327b4821) The counter's clock can miss an edge, and the accent gets a wire of its own
- [`1cad474`](https://github.com/cmdcolin/bender/commit/1cad4745faa8973d416592facb56796eb6cc1874) The reset is the mark, not the number it sits beside
- [`b51816d`](https://github.com/cmdcolin/bender/commit/b51816d482196a2ea6c994fda26225d5dad0ee44) Sampler speed: ride ×1, don't crawl at rest
- [`c8d4a50`](https://github.com/cmdcolin/bender/commit/c8d4a509a66066190b38a357b9d521c2778de677) Five chips for the two new knives
- [`9d1872c`](https://github.com/cmdcolin/bender/commit/9d1872cd46399c035d2e4fd284713704c17d96c3) Say plainly that Record and Erase rewrite the tape for good
- [`d0bf2d7`](https://github.com/cmdcolin/bender/commit/d0bf2d74b66e069091e1dd544cf391de5afc8302) Say it in the panel, not just the tooltip

## [0.17.4](https://github.com/cmdcolin/bender/compare/v0.17.3...v0.17.4) - 2026-08-31

### Other Changes
- [`18ef697`](https://github.com/cmdcolin/bender/commit/18ef69709b3c8632bd779f4e23f12f1bee76ee22) Measure the ring mod against nine prototypes, and rank what came back
- [`41cf51d`](https://github.com/cmdcolin/bender/commit/41cf51dba91b6eecb429bd5fc302ed9f2f20b4c6) Build the three ring mod candidates the measurements ranked
- [`91554ea`](https://github.com/cmdcolin/bender/commit/91554ea915ec0d61dd551322abd47bce4620062a) Say which of the ring mod candidates got built

## [0.17.3](https://github.com/cmdcolin/bender/compare/v0.17.2...v0.17.3) - 2026-08-31

### Other Changes
- [`84c6254`](https://github.com/cmdcolin/bender/commit/84c62545f50b3d85696326021ffede447c62552a) Stop the rail lamp laying the document out sixty times a second
- [`7a58296`](https://github.com/cmdcolin/bender/commit/7a58296b5a03645bf72c58b682c190884fd1cbff) Say whether React is what drops the frames, since it is the first thing asked
- [`2402df6`](https://github.com/cmdcolin/bender/commit/2402df681f08dc678a939ba2b7776507eaad0ab4) Scroll the opened stage into view a frame later, not inside the commit
- [`61de157`](https://github.com/cmdcolin/bender/commit/61de1573967109f8a135d3021945f706ba0da6a5) Draw the letter-keys switch, since keys on a bed of keys names nothing
- [`0c4ae61`](https://github.com/cmdcolin/bender/commit/0c4ae610ab73438ccc5f25aabc2e77db6c46a78f) Put the letters wire in a drawer, since a cap could not name it
- [`d302615`](https://github.com/cmdcolin/bender/commit/d302615d94873291ff6cf60dcce6a196e0b6bc5e) Add about
- [`2e23b49`](https://github.com/cmdcolin/bender/commit/2e23b49e6d26ddf9eac375e11a3187e531aae77c) Fetch tags with --force in push script
- [`7445d26`](https://github.com/cmdcolin/bender/commit/7445d2629366bc4dcd5d639bcbabebd4bb376765) The chaos oscillator never actually motorboated
- [`778316b`](https://github.com/cmdcolin/bender/commit/778316bafd5e2bdb9858169fa3f60358c0a709f3) Weigh the split slider one hue instead of two, and mark the sampler's unity and the tape's ordinary speed
- [`49bdec6`](https://github.com/cmdcolin/bender/commit/49bdec668ef452170386707cdc736b9c072550a9) Every pitched thing on the board had a lane except the oscillator
- [`986614e`](https://github.com/cmdcolin/bender/commit/986614e6b3d8875b2f2368b4e335eb231c3bcf64) Draw the keyboard the case has room for, not three octaves either way
- [`0488428`](https://github.com/cmdcolin/bender/commit/0488428cb5d194acf4fcdb85488e785ebebd1d98) Walk every stage looking for ink on ink, and for text nobody can read
- [`ec6d4bf`](https://github.com/cmdcolin/bender/commit/ec6d4bf6a08bceb47f0622f792f3d830c392a26c) A word on a button is measured against what it says, not against its tier
- [`035af12`](https://github.com/cmdcolin/bender/commit/035af120d1701e8546a46f64e7e0d8940a2cd5c8) The control row: the name says it opens, and one travel takes the measure
- [`1ab91e3`](https://github.com/cmdcolin/bender/commit/1ab91e3ec77dbbb4b82a2ac0ebeb174e00554be1) The ? dots said what the button beside them already said, and drift stops

## [0.17.2](https://github.com/cmdcolin/bender/compare/v0.17.1...v0.17.2) - 2026-08-30

### Other Changes
- [`d2b8069`](https://github.com/cmdcolin/bender/commit/d2b806938aa027ff925eb70666e8ef03424b4737) Draw where the buses run, since Data line means three things

## [0.17.1](https://github.com/cmdcolin/bender/compare/v0.17.0...v0.17.1) - 2026-08-30

### Other Changes
- [`b9fbf28`](https://github.com/cmdcolin/bender/commit/b9fbf281ec51c6649847e8994052362c961666fb) Measure the FM chip as the three machines it is

## [0.17.0](https://github.com/cmdcolin/bender/compare/v0.16.0...v0.17.0) - 2026-08-30

### Fixes
- [`00841fb`](https://github.com/cmdcolin/bender/commit/00841fb9c9e895096d5bf05088409092d567cb85) a release must be above the highest tag on origin

### Other Changes
- [`a980423`](https://github.com/cmdcolin/bender/commit/a980423027ce9b08726312fafc4d250d3958fb46) The bits the map had no reader for
- [`35a5a23`](https://github.com/cmdcolin/bender/commit/35a5a23b486a0ba69f4d6dcb9ef5750ac60f4a22) A vibrato button, which is two bits and no register
- [`fa7dabd`](https://github.com/cmdcolin/bender/commit/fa7dabd6a08a25f5056a6788d4107d33098e26cc) Cover the bits, including the one that reads oddly
- [`2ff7082`](https://github.com/cmdcolin/bender/commit/2ff7082a9e17486264de3e795ed79636a2111525) Write down what is in the gaps in the register map
- [`21f991e`](https://github.com/cmdcolin/bender/commit/21f991e26f3aeb2dee29ccc0eb12db66300a9f6b) Name the cut that hands you a sound instead of taking one
- [`a3f3b2d`](https://github.com/cmdcolin/bender/commit/a3f3b2d85a880e30d58e2b68aadda44ce981ff56) A bias trimmer on the stage that makes the bank a clatter
- [`3a56076`](https://github.com/cmdcolin/bender/commit/3a560762123068ca6d08de872d9a3c89edeeedc3) Bias the noise transistor toward its knee and let it change its mind
- [`266f18d`](https://github.com/cmdcolin/bender/commit/266f18dba8da1f8abb1cfdaa44218d5e9844b3cb) Two boards for the two new trimmers, since neither is one knob from stock
- [`df27a4d`](https://github.com/cmdcolin/bender/commit/df27a4d1d54278612fa8b1b7cb23b4404f6b07b5) Say what the flatness figure was measured through, and split a run-on
- [`4809c95`](https://github.com/cmdcolin/bender/commit/4809c95c339e1e37a7d1af9a2acace9d4a025764) Write down the FM bends that did not get built

## [0.16.0](https://github.com/cmdcolin/bender/compare/v0.15.2...v0.16.0) - 2026-08-30

### Other Changes
- [`105c337`](https://github.com/cmdcolin/bender/commit/105c33706f2ae4d28bc517dc5d94f62f2005d7da) More stuff
- [`b1ba555`](https://github.com/cmdcolin/bender/commit/b1ba555bf24e750cbd5333e01b0ed80df8fce72d) A cut trace drifts after its neighbour instead of sitting on ground
- [`a721eae`](https://github.com/cmdcolin/bender/commit/a721eae4cd080293176356651f666ed0fc2e3484) Give the FM chip a percussion bank, so its bends reach the whole spectrum
- [`7fde13a`](https://github.com/cmdcolin/bender/commit/7fde13aacae65b2a80b34ec9054ec5921265399b) Let the knife switch the percussion bank on, not just off
- [`76443ea`](https://github.com/cmdcolin/bender/commit/76443ea90fc93670ee2d0cfa370a18ba72cdb871) A preset for the percussion bank, since nothing else points at it
- [`ccedf97`](https://github.com/cmdcolin/bender/commit/ccedf9776c682be1a09b8e5a42136fa2c732ec69) Thin a comment that said the row order twice
- [`fd05c2f`](https://github.com/cmdcolin/bender/commit/fd05c2f3c09f0533a91fbd87fe74d1b51d99998a) Name the drifting wave cut, now that it is the loudest knife on the chip
- [`218d163`](https://github.com/cmdcolin/bender/commit/218d1637874e5b6f2f9ed50fbea7c767019fa599) pnpm spectrum: what a bend sounds like, not just whether you can hear it

## [0.15.2](https://github.com/cmdcolin/bender/compare/v0.15.1...v0.15.2) - 2026-08-29

### Other Changes
- [`f81064c`](https://github.com/cmdcolin/bender/commit/f81064c9b00e66099f6783b7ef5de1387925f75a) Count the kit's pads off the kit
- [`2f199c8`](https://github.com/cmdcolin/bender/commit/2f199c86b7bd77ce2d72353923f58c45d3172007) Run typecheck and test locally before release
- [`f7261d0`](https://github.com/cmdcolin/bender/commit/f7261d0a7686925488ebd0f6df04a9c43fffe2a6) One converter, eight voices, and a chip that cannot pretend otherwise
- [`e64aec3`](https://github.com/cmdcolin/bender/commit/e64aec3843fe2d82ea557a99a697279e280ac3c4) Unsolder the choke resistor and let it go anywhere

## [0.15.1](https://github.com/cmdcolin/bender/compare/v0.15.0...v0.15.1) - 2026-08-29

### Other Changes
- [`ed22d3d`](https://github.com/cmdcolin/bender/commit/ed22d3d50abc9bcdcb510114d0f88f91024145f8) Let the sampler's speed crawl without fighting the hand
- [`0dc73cf`](https://github.com/cmdcolin/bender/commit/0dc73cf668350402de5f21bbc3d0000e1d5739f9) Build the metal bank, and hang an open hat and a cymbal off it
- [`19dc72c`](https://github.com/cmdcolin/bender/commit/19dc72c08ea2c9cf597fcf499347f4c42e887de5) Cover the metal bank, and give the kit patterns that use it
- [`64f96be`](https://github.com/cmdcolin/bender/commit/64f96be5c515db9bcb7e9dccabc59cdf26d3f135) Read the heat drift off the rail instead of guessing at it from the mix
- [`acbc686`](https://github.com/cmdcolin/bender/commit/acbc6861b0778105fe90cc28227fd067b740f4e8) Say what the metal section is once, where it belongs
- [`4c6dd28`](https://github.com/cmdcolin/bender/commit/4c6dd2802ced981f9f974d3623098ba9e8847e61) Note the fourth way a link moves under an old board
- [`11c4522`](https://github.com/cmdcolin/bender/commit/11c45227871f86fcb66c3f729d45bc61c484309c) Say what a clock on the wire reaches, and where it stops
- [`b4b5e52`](https://github.com/cmdcolin/bender/commit/b4b5e52885a7bf85538a1c0d3a81cbd931030765) Render the squeal once per case instead of twice

## [0.15.0](https://github.com/cmdcolin/bender/compare/v0.14.0...v0.15.0) - 2026-08-29

### Fixes
- [`280f8ce`](https://github.com/cmdcolin/bender/commit/280f8cec711665787d15d021f87dd3e5a11f2c20) fix tests

### Other Changes
- [`7eea4c8`](https://github.com/cmdcolin/bender/commit/7eea4c8cb8f984edefda04271a900fa96c2a7b3b) Use relative base path so builds deploy to any base URI
- [`7d67ccb`](https://github.com/cmdcolin/bender/commit/7d67ccbbbaa5a4f5745b5c57d46b720292af43ed) FM chip: its own key input, and a jumper to cut off the toy's gate
- [`0bd63a5`](https://github.com/cmdcolin/bender/commit/0bd63a549e300e48d430e17d822162d4756e98df) A second keybed on the panel, for the FM chip
- [`19e7aac`](https://github.com/cmdcolin/bender/commit/19e7aacd61bd9faf73e42a9a0103028a25114fbb) play the toy, the FM chip, both, or a split keybed
- [`ad2233c`](https://github.com/cmdcolin/bender/commit/ad2233c3c8d06ffc97972d2b8b3830f92f606c70) Two presets for the two keybeds
- [`c7f0ccf`](https://github.com/cmdcolin/bender/commit/c7f0ccf96032d34eafceb463861c034ee34a8b61) Clarify reverb/delay return and dry-cut wording
- [`8ec2301`](https://github.com/cmdcolin/bender/commit/8ec23015fc0d0954c71c11ee65484e8a9c3f8827) Cut the reading a box, so a moving number can't move the track
- [`c3a60f6`](https://github.com/cmdcolin/bender/commit/c3a60f619ca35c4e6931e5138ece7540c8dbf546) Let clicking a control's label pin its tooltip open
- [`5b3231f`](https://github.com/cmdcolin/bender/commit/5b3231f9b61a8a95ae1b6c4606b34aac19343e81) Roll the patch bay as a patch rather than as twelve sliders
- [`aed9d30`](https://github.com/cmdcolin/bender/commit/aed9d30ca718f7c76c0635fe3822e9433edefa00) Reserve the reading once per panel, so the tracks line up too
- [`b293057`](https://github.com/cmdcolin/bender/commit/b2930578a9b4b566b4ddbd054f26e9bc8ee5c8dc) Draw the FM chip's bed as a bare board, not a second toy
- [`052dadc`](https://github.com/cmdcolin/bender/commit/052dadca555e00201d4d7a1ad22e483b5e1ac333) An arpeggiator on the toy's own divider
- [`2519f6b`](https://github.com/cmdcolin/bender/commit/2519f6b86ddf3b74daaee8c21c4aa46dcce4f2b7) Hold the bay together under a shake, and under drift
- [`57c543b`](https://github.com/cmdcolin/bender/commit/57c543bbd207f1d827073d632918218ac2de1c2f) Say which wire reaches nothing, where the wires are drawn
- [`fd80f19`](https://github.com/cmdcolin/bender/commit/fd80f192167d620adcab65158ca5a845bc35e3ba) A diode matrix on the key line, so the board plays in a key
- [`4793149`](https://github.com/cmdcolin/bender/commit/479314966ff33c161ce1209f051160745a3f9b1d) Send the kit's clock and the chips' notes back out the wire
- [`63f84f1`](https://github.com/cmdcolin/bender/commit/63f84f1d8b37f80ba5fb8e3f021af22b40b39ebc) Solder the board's other wires onto something too
- [`dbfbb2b`](https://github.com/cmdcolin/bender/commit/dbfbb2b7e3a92cc166ed54e2bff8bf3ec88a0efe) Say in the guide that the bay names its own dead wires
- [`2eedd29`](https://github.com/cmdcolin/bender/commit/2eedd2963a425730b3a34623030125e77bafa579) Write down what it would take to play the board from a program
- [`a49333c`](https://github.com/cmdcolin/bender/commit/a49333c14f8b7c26e86727e681a0b36d95991c05) Steps the kit only sometimes plays
- [`3d89d2b`](https://github.com/cmdcolin/bender/commit/3d89d2bb7029331fdafacc2675d1e69150e85694) Record the sources as separate stems
- [`8969f79`](https://github.com/cmdcolin/bender/commit/8969f79850975be02070c9400c2357b2fbe5ece0) Write down where the stem tape sits and why
- [`f16cfc0`](https://github.com/cmdcolin/bender/commit/f16cfc014709dec03685856036fff2e5e8f6d5f6) Rebuild the toy drums' pitched voices on bridged-T networks
- [`aa542e6`](https://github.com/cmdcolin/bender/commit/aa542e684f1586711e854528756744fcb61d4f05) Calibrate the new voices and cover them
- [`e7ce78e`](https://github.com/cmdcolin/bender/commit/e7ce78eb8c109e4035581708437dc227409c25c5) Describe the rebuilt voices in the docs and the voice table
- [`1c0fd31`](https://github.com/cmdcolin/bender/commit/1c0fd31630149d1b4e07991027615e0206505698) Run the toy off the kit's tempo
- [`6ea5da4`](https://github.com/cmdcolin/bender/commit/6ea5da4251461bab36014f1320d5368b032907d5) Write down where the tempo lock landed
- [`3efc4ea`](https://github.com/cmdcolin/bender/commit/3efc4ead94a33a8f32402f2e87f9b36976a46304) Scope the wire-off golden to the toy the test is about

## [0.14.0](https://github.com/cmdcolin/bender/compare/v0.13.3...v0.14.0) - 2026-08-28

### Other Changes
- [`28c084a`](https://github.com/cmdcolin/bender/commit/28c084a1ba11a2b988947524292a860cd70e7af5) Merge Signal chain and Pedal board into one Signal order button
- [`5e47695`](https://github.com/cmdcolin/bender/commit/5e47695921efd6bc90083d4998dcd0065cae1fc7) Add a symlog curve for the sampler's speed slider
- [`418bb57`](https://github.com/cmdcolin/bender/commit/418bb57a7ab1cccbcf4cf7b81384cba1c040c48c) Fold Solder into Wear and drop the signal chain box
- [`dcaadd4`](https://github.com/cmdcolin/bender/commit/dcaadd4c8725e2eb360b0e695d497675118101c8) Give the pedals glyphs, and drop the dead tail box
- [`87a0957`](https://github.com/cmdcolin/bender/commit/87a095707ede4bbfab6e026eb41d8c28391a1ef6) Draw where Brownout's sag reaches
- [`e855e9c`](https://github.com/cmdcolin/bender/commit/e855e9cb3fc6881d845e648c85a72d4b19027b5f) Fade in a board opened from a link, add a start overlay
- [`7390df1`](https://github.com/cmdcolin/bender/commit/7390df100b4581d5de7cfaf812c70dd1f1b42e42) Add play/pause to the piano roll and drum grid, and drum pattern slots

## [0.13.3](https://github.com/cmdcolin/bender/compare/v0.13.2...v0.13.3) - 2026-08-27

### Other Changes
- [`edffd3f`](https://github.com/cmdcolin/bender/commit/edffd3f2e2e68bbc143660367751699c10992ef9) Let reset override HOLD_KEYS on the group it owns

## [0.13.2](https://github.com/cmdcolin/bender/compare/v0.13.1...v0.13.2) - 2026-08-27

### Other Changes
- [`1f5c517`](https://github.com/cmdcolin/bender/commit/1f5c51790125d13025b583129f921ab19005a260) Fix transparent midi popover by stacking it above panel siblings
- [`a70c18a`](https://github.com/cmdcolin/bender/commit/a70c18a269fb133a827f58da7d05099740c73565) Let the rack say what Solder is doing to the path
- [`c49b1a8`](https://github.com/cmdcolin/bender/commit/c49b1a827e17e6cd272afd5b344997943037c646) Let the pedals be ordered too

## [0.13.1](https://github.com/cmdcolin/bender/compare/v0.13.0...v0.13.1) - 2026-08-27

### Other Changes
- [`833bdf3`](https://github.com/cmdcolin/bender/commit/833bdf3ff5a493f6b11627fc063edd21dbd67aaa) Say why a bend is silent on its row, not on seven faders
- [`b27c68a`](https://github.com/cmdcolin/bender/commit/b27c68adc26e58977beae1cafee410fa30a9b7b7) Drop the six position dropdowns; the rack takes the keyboard

## [0.13.0](https://github.com/cmdcolin/bender/compare/v0.12.3...v0.13.0) - 2026-08-27

### Other Changes
- [`28be05a`](https://github.com/cmdcolin/bender/commit/28be05a35c06e58e6bfbd725f99e2ec497ee45a7) Give the feedback desk a row of named settings
- [`fc37ead`](https://github.com/cmdcolin/bender/commit/fc37eaddfaf64a0d07b1230677ec026c48b50473) Give the slot rack named chains and the mixes to hear them with
- [`688a570`](https://github.com/cmdcolin/bender/commit/688a5703144fa72c58dc3f84a964b1a596a009e0) Cap the patch bay diagram's width so it reads as small
- [`45b2cd4`](https://github.com/cmdcolin/bender/commit/45b2cd4bfa53b3ee7298f2132472eb32fddb4993) Draw the trigger loop and the mic's seven jacks
- [`b5c5972`](https://github.com/cmdcolin/bender/commit/b5c59721ed989880527c5baba971c3db9c19e5aa) Call it the signal chain, and make the rack one you can drag
- [`46a2285`](https://github.com/cmdcolin/bender/commit/46a22850d46a79429b0ea148800fdcb2d3606d43) Give the shelf drag a plain-text payload too

## [0.12.3](https://github.com/cmdcolin/bender/compare/v0.12.2...v0.12.3) - 2026-08-27

### Other Changes
- [`3cde27f`](https://github.com/cmdcolin/bender/commit/3cde27f9a7ae06f9fd3091fb2bdb32e19bd4fb9d) Draw the patch bay's four wires instead of listing them

## [0.12.2](https://github.com/cmdcolin/bender/compare/v0.12.1...v0.12.2) - 2026-08-27

### Other Changes
- [`d146d9f`](https://github.com/cmdcolin/bender/commit/d146d9fd825c5bf978f0a1c326708816dd475673) Draw the bend rack instead of six identical selects
- [`cdd1d3f`](https://github.com/cmdcolin/bender/commit/cdd1d3fe6664032a27cd31c13e0a5d8fc4e54ad7) Give a foot-row wire's label the whole row's edge to clear
- [`e7afc7e`](https://github.com/cmdcolin/bender/commit/e7afc7ed0358ec807beb06107cd4578d4a21f8e0) Keep mutate, drift and random from rolling into a brownout

## [0.12.1](https://github.com/cmdcolin/bender/compare/v0.12.0...v0.12.1) - 2026-08-27

### Other Changes
- [`d7f67cc`](https://github.com/cmdcolin/bender/commit/d7f67cccb6edeb783c59701c837cbf900bcc9d41) Draw the feedback bus as three strips into one return

## [0.12.0](https://github.com/cmdcolin/bender/compare/v0.11.0...v0.12.0) - 2026-08-27

### Other Changes
- [`9b046d6`](https://github.com/cmdcolin/bender/commit/9b046d64ddc55abfd8d823808c8643076bcdb56f) A note drawn on the roll puts the chip on the memory
- [`c6000d2`](https://github.com/cmdcolin/bender/commit/c6000d246a97456d69d01707662c2daa6c7deae8) Mono reads one lane, so the roll draws and writes one lane
- [`e7fb5cd`](https://github.com/cmdcolin/bender/commit/e7fb5cd8221219d7dd83bc1d189b31640bc22312) The number is the way back: click a moved control's reading to reset it
- [`57c54c7`](https://github.com/cmdcolin/bender/commit/57c54c72fab4b9ea4cbed2ea994012352b497b6c) Say when the roll is not drawing all of the memory

## [0.11.0](https://github.com/cmdcolin/bender/compare/v0.10.1...v0.11.0) - 2026-08-27

### Other Changes
- [`9476c8a`](https://github.com/cmdcolin/bender/commit/9476c8ab2109b292d26254d69289dc96765902c9) Name the tune the switch actually runs, and the loop the number sets
- [`6ebb0c7`](https://github.com/cmdcolin/bender/commit/6ebb0c7d6c2dba604ee7f278e2a4d331f01ed3a2) A roll you pointed at lands somewhere you were not
- [`2ce0f5d`](https://github.com/cmdcolin/bender/commit/2ce0f5d20833214014609865264ec9e27f6f83a1) Say the tip is there, and make it readable when it is
- [`f216bdc`](https://github.com/cmdcolin/bender/commit/f216bdc201978c0b13e44c1547a6cc8013d6998b) Cut the tips to what they answer, in one voice
- [`79ac594`](https://github.com/cmdcolin/bender/commit/79ac594dec01db08a88be2cc7e70ffee07f2a464) Name the frame's lip for the door it is
- [`25f9aac`](https://github.com/cmdcolin/bender/commit/25f9aacb10505b3e1497d01335e894ec576ff0bd) Let the memory keep a chord: two chips stacked on the one
- [`761276c`](https://github.com/cmdcolin/bender/commit/761276c0eae9b84de1a66acf6fd3a362a34cec50) Count a packed link from zero, not from the floor of a travel

## [0.10.1](https://github.com/cmdcolin/bender/compare/v0.10.0...v0.10.1) - 2026-08-27

### Other Changes
- [`61b8f61`](https://github.com/cmdcolin/bender/commit/61b8f61e2476fdf6c9b5b3a96c97c3463fdfdf3c) Put the tape where you can see it going round
- [`576189d`](https://github.com/cmdcolin/bender/commit/576189da3fe479710006e3a9df9bf57f24b55e9a) The features list stopped short of half the instrument
- [`00242ef`](https://github.com/cmdcolin/bender/commit/00242ef8edda31d3f8376e39254b4f8e2a782f0d) The tape was the one source a starve could not reach
- [`d566045`](https://github.com/cmdcolin/bender/commit/d56604568d49b54df81561ba09906c041d448efc) Dice on the heading, not only on the stage
- [`a7a4467`](https://github.com/cmdcolin/bender/commit/a7a4467067ae27ba4477bc56888d1d6e43ee9591) The reel drew the two knobs, not the tape
- [`0341dc5`](https://github.com/cmdcolin/bender/commit/0341dc5440963593cfeb3329a75a09a92b8ac88b) Two tape boards you can hear on one press
- [`71cc9b7`](https://github.com/cmdcolin/bender/commit/71cc9b7dac6c096f8b31fc11fce6acb7c172a0fa) Pack the board into the link, and keep the readable one
- [`ab95332`](https://github.com/cmdcolin/bender/commit/ab95332fd04cf909643d71ac95f8f0dd69a60d0d) Demo
- [`6d63bf0`](https://github.com/cmdcolin/bender/commit/6d63bf0145f081a2d50986d2ede561658998b1b8) Trim the features doc, and say what the board grew
- [`7add607`](https://github.com/cmdcolin/bender/commit/7add607b62bb9331a6f2b6fc08399b4ade8efbf6) Draw the sampler's speed as two directions, not one number
- [`412b64d`](https://github.com/cmdcolin/bender/commit/412b64dc0b723a53fb2faf03bc691c179005a7c4) Let the arrow keys walk off the stop
- [`17aa5d6`](https://github.com/cmdcolin/bender/commit/17aa5d6ff070a19110d9d3622515539a1563bf7d) Paint every travel whose middle is a turn
- [`6e90f60`](https://github.com/cmdcolin/bender/commit/6e90f609700a163df694404dfb7d3d91c00c3ee4) Show the board, and the panel enlarged beside it
- [`bc741a3`](https://github.com/cmdcolin/bender/commit/bc741a3213c43b1b0209054cd34d5d5db957dfc6) One picture of the board, not two
- [`0b0f23c`](https://github.com/cmdcolin/bender/commit/0b0f23c5177d81ac261f8759772e74abf336cc21) Shoot the README's picture with a script, and put the panel beside the app
- [`ad8df8a`](https://github.com/cmdcolin/bender/commit/ad8df8af2eb864803c8002155ba42c81dd79de4c) Shoot the figure at two device pixels, in a narrower window
- [`ae9b003`](https://github.com/cmdcolin/bender/commit/ae9b0037c34fab894f3a59dc6d95fac120d1b8db) Give the rack's three doors one grammar apiece
- [`bcb16b9`](https://github.com/cmdcolin/bender/commit/bcb16b917ee9803fba17d3a96e0c2d3890cf53e8) Draw the path at the size it was drawn
- [`f3e2028`](https://github.com/cmdcolin/bender/commit/f3e20282dc47f0b3910d336f52fcfd404f72910c) Eight rolls, one button
- [`dd4fc00`](https://github.com/cmdcolin/bender/commit/dd4fc00d99dcb7427a7802fe4cc27b139442ed7f) The presets were the one thing on the panel with no name on it
- [`222d30c`](https://github.com/cmdcolin/bender/commit/222d30c0bf967e41f664e4d3d1465b2d58d34c08) Three things the wider panel found
- [`02b48c1`](https://github.com/cmdcolin/bender/commit/02b48c1115c4fa445dca7c041b8f4a9cb55509d5) Give the height back to the stage the door opens
- [`64b8d06`](https://github.com/cmdcolin/bender/commit/64b8d067bd95186904a1b6dfe5159fcc9ec29f90) The midi call was an advertisement, not a heading
- [`13a9b62`](https://github.com/cmdcolin/bender/commit/13a9b621aeb870e1861a33be1012f630c16eb4c2) The wire is not a stage of the board
- [`008701f`](https://github.com/cmdcolin/bender/commit/008701ff0e5bd7044a8e6281df72a1c22535bb93) One picture, the panel big and the board bare
- [`a2d1a44`](https://github.com/cmdcolin/bender/commit/a2d1a443626b189b74d5bce895bc8462dba962de) Draw the empty trigger lane's note as the door it is
- [`d9b01f0`](https://github.com/cmdcolin/bender/commit/d9b01f027486dbe8d3f7b401670bb307e668f8ea) Your tune is as long as the chip's own
- [`b3bc2a1`](https://github.com/cmdcolin/bender/commit/b3bc2a11f5b38ecbd1b2daddac5cd20f58a22b05) Put the song the chip is on above the roll
- [`91c92bf`](https://github.com/cmdcolin/bender/commit/91c92bf17958719446fd8eb47a9b0e0e2c091523) Say what the thing is, not how well it is written

## [0.10.0](https://github.com/cmdcolin/bender/compare/v0.9.3...v0.10.0) - 2026-08-26

### Other Changes
- [`3be3b68`](https://github.com/cmdcolin/bender/commit/3be3b68004cc0eedc343f24b66492a7ba198ec27) One loop through one tanh is a squeal, not a desk
- [`428c5e5`](https://github.com/cmdcolin/bender/commit/428c5e51bc610249c88d15443283c4b9545297b4) The sampler is the tape, so put the record head on it
- [`a0d45ba`](https://github.com/cmdcolin/bender/commit/a0d45baa099c3f39d83d1f730cedc573b2f18a04) Roll a sample off archive.org instead of going to find one

## [0.9.3](https://github.com/cmdcolin/bender/compare/v0.9.2...v0.9.3) - 2026-08-24

### Other Changes
- [`b1e73c2`](https://github.com/cmdcolin/bender/commit/b1e73c2859fe6a517a93ae36cc70d539545c8584) A replay head reads no dc off the medium

## [0.9.2](https://github.com/cmdcolin/bender/compare/v0.9.1...v0.9.2) - 2026-08-23

### Other Changes
- [`6ce12d9`](https://github.com/cmdcolin/bender/commit/6ce12d9f3145d430cbe64e4d915d29934207920b) Self-erasure moves the replay corner, not the coefficient

## [0.9.1](https://github.com/cmdcolin/bender/compare/v0.9.0...v0.9.1) - 2026-08-23

### Other Changes
- [`4b082cd`](https://github.com/cmdcolin/bender/commit/4b082cdd9d3f269054efaeb77d6b27b4ae9342fa) The bus drive is denser all the way up, and never quieter

## [0.9.0](https://github.com/cmdcolin/bender/compare/v0.8.0...v0.9.0) - 2026-08-23

### Other Changes
- [`9df218b`](https://github.com/cmdcolin/bender/commit/9df218bce483bd798e4ad87022da3737494266bd) Split the sprawling README into docs/, in plain prose
- [`035a0af`](https://github.com/cmdcolin/bender/commit/035a0afbb1992baeec45ddce105f905e2047007c) The record level buys distortion, and stops spending level to do it

## [0.8.0](https://github.com/cmdcolin/bender/compare/v0.7.0...v0.8.0) - 2026-08-22

### Other Changes
- [`e4a4b5b`](https://github.com/cmdcolin/bender/commit/e4a4b5be9cf904d3547e2e52899ff6d15bbe72eb) A row of named cuts under each knife on the bus
- [`f086ae4`](https://github.com/cmdcolin/bender/commit/f086ae4e4727f36326c5631cb7700739e4a3b476) Sweep the buses and print what you can hear
- [`73e8a42`](https://github.com/cmdcolin/bender/commit/73e8a42a1b430cdcec5fed9e57b93cf215c6494c) A delay pedal that behaves, beside the one that doesn't
- [`56ea005`](https://github.com/cmdcolin/bender/commit/56ea005d89081ae76cbc158b51d5699b3065d26d) A number row to play the kit with, and a record button that lands where you aimed
- [`8ab8421`](https://github.com/cmdcolin/bender/commit/8ab8421655cc605ef55238704ba93c682b0d838a) Hold the number row under test
- [`cab5762`](https://github.com/cmdcolin/bender/commit/cab5762035e02a0171217cbfea614ae903b01997) A record button on the keyboard, and the nineteenth tune is yours
- [`070ea88`](https://github.com/cmdcolin/bender/commit/070ea881b11ba3312c1fa1562f1e273297882d29) A tap is one step, and the playhead stops looking like a chord
- [`f9c5dfc`](https://github.com/cmdcolin/bender/commit/f9c5dfcbe9daa476dcfaa897a66c3f2418029400) A rack at the head of the run, and a shelf with nothing left on it
- [`842af9e`](https://github.com/cmdcolin/bender/commit/842af9e9edc00728b5c36e59368a49ca8f4d0105) Regenerate docs/features.md (stale knob count after record button commit)

## [0.7.0](https://github.com/cmdcolin/bender/compare/v0.6.7...v0.7.0) - 2026-08-21

### Other Changes
- [`c52c65f`](https://github.com/cmdcolin/bender/commit/c52c65f1c1241e56cbfaca0396d97f982b63432b) The record curve and the replay curve are each other's inverse
- [`497f84f`](https://github.com/cmdcolin/bender/commit/497f84ff2e24d3144557ea9485c7bca588fadeda) A bump with the scoop that pays for it, and a bloom the medium keeps
- [`30a7096`](https://github.com/cmdcolin/bender/commit/30a709619d1ca3fd7533c05b305fa7c61ef0c4bf) The tape goes off, and the machine screams about it
- [`6ea2796`](https://github.com/cmdcolin/bender/commit/6ea27960f4b3f4a639d0e117854bd4c221684f60) Clamp the span's note under Nyquist on a slow rate
- [`49c3fe9`](https://github.com/cmdcolin/bender/commit/49c3fe905acadb9d276b76176312ff028c88e08e) The noise table had a dc offset, and the tape's drift found it
- [`de1876c`](https://github.com/cmdcolin/bender/commit/de1876c22da4d9de972edd5a82cff714c48106ad) The noise source drew the same noise on every boot
- [`7a56aa3`](https://github.com/cmdcolin/bender/commit/7a56aa37ada60f6c9f66af48ace6d73f675bea17) Oxide sheds in patches, and a patch sits on one track
- [`8e7427f`](https://github.com/cmdcolin/bender/commit/8e7427f10f78037a3463b7054b22ba35214e64b8) The top of the band gets less headroom than the bottom
- [`11b3c51`](https://github.com/cmdcolin/bender/commit/11b3c51447c510dc08d4659637a2aa6f1b14e201) One boot is a measurement of the seed, not of the board
- [`266fd2a`](https://github.com/cmdcolin/bender/commit/266fd2ab0c9d1587016008ef004e65d108ee6d0d) Scrape flutter and the squeal are one span
- [`7e91583`](https://github.com/cmdcolin/bender/commit/7e915832ba4a4a3e284fbf7d2da1cb0112ae31b9) A take opened on a dropout, on both heads, every time
- [`a9b04d1`](https://github.com/cmdcolin/bender/commit/a9b04d127f8ce378f4ac1392146246c4058c1ffd) The delay's flutter walked the same walk on every boot

## [0.6.7](https://github.com/cmdcolin/bender/compare/v0.6.6...v0.6.7) - 2026-08-21

### Other Changes
- [`bea2db0`](https://github.com/cmdcolin/bender/commit/bea2db0e7fa72705226828d8d1ea8d077c4b6dec) Rename the preset chip row off Presets.tsx
- [`064a1e4`](https://github.com/cmdcolin/bender/commit/064a1e463f4edee66d890f706dd3786f5395c16f) A desk for the six of them, verbs for the grid, and a magnetised tape

## [0.6.6](https://github.com/cmdcolin/bender/compare/v0.6.5...v0.6.6) - 2026-08-19

### Other Changes
- [`30fab83`](https://github.com/cmdcolin/bender/commit/30fab83bf8a6d9ee946ddf1c766af8f81d7dacf8) The panel stops running off the bottom of the screen

## [0.6.5](https://github.com/cmdcolin/bender/compare/v0.6.4...v0.6.5) - 2026-08-19

### Other Changes
- [`f6a494a`](https://github.com/cmdcolin/bender/commit/f6a494a2c90bf9cf7a904a69421af9310e9b141a) A dozen chips, and the rest when you ask

## [0.6.4](https://github.com/cmdcolin/bender/compare/v0.6.3...v0.6.4) - 2026-08-19

### Other Changes
- [`7d00e47`](https://github.com/cmdcolin/bender/commit/7d00e476b2eda70a57f1a5116171402c2495fc2d) Six boxes that say what they are, and the chip that isn't a peer

## [0.6.3](https://github.com/cmdcolin/bender/compare/v0.6.2...v0.6.3) - 2026-08-19

### Other Changes
- [`4affed2`](https://github.com/cmdcolin/bender/commit/4affed24c9e353f3d59040d53de81990862278bc) A modal that says what the hunt is doing while it does it
- [`d69ac47`](https://github.com/cmdcolin/bender/commit/d69ac474fe5584648efa3b9c958e51642e2a2f7c) A panel long enough to need headings, and lists where a wall of buttons was
- [`4199d85`](https://github.com/cmdcolin/bender/commit/4199d8529a52e79c43e5f3655e61d84de08ef780) Say in the README what shape a panel takes
- [`3aea65b`](https://github.com/cmdcolin/bender/commit/3aea65b106303a9ec87c5b80802778e87b206f2e) A key with a hand on it is a note the chip holds, and two more panels that fold
- [`6da8a71`](https://github.com/cmdcolin/bender/commit/6da8a7174ead20472796127309fb1fafde982048) Fixes the panel needed: a drop it eats, a ROM you can't take back
- [`ab955a5`](https://github.com/cmdcolin/bender/commit/ab955a5b420a0b94d2d50d82d7db96f3d147c08f) Read a figure off the board, not the board
- [`9bb2d7d`](https://github.com/cmdcolin/bender/commit/9bb2d7d6620e87d81b11067feed25507f33b34bb) Put the panel under test, where nothing was
- [`1558918`](https://github.com/cmdcolin/bender/commit/155891892e8c306c1c9a9aba51e9b8c194c5d435) Three knobs that could not print their own step, and a number a keyboard can reach

## [0.6.2](https://github.com/cmdcolin/bender/compare/v0.6.1...v0.6.2) - 2026-08-19

### Other Changes
- [`0f1e715`](https://github.com/cmdcolin/bender/commit/0f1e71594a0c60d2a34ca3e8e0de6af2b4cfa65d) Four presets that were another preset with the reverb up, and shorter names
- [`28b143e`](https://github.com/cmdcolin/bender/commit/28b143e6df97a9f2261745c33d0057aa1f90e25b) Names that sit in one of the families the catalog already has

## [0.6.1](https://github.com/cmdcolin/bender/compare/v0.6.0...v0.6.1) - 2026-08-18

### Other Changes
- [`1785c4a`](https://github.com/cmdcolin/bender/commit/1785c4ab69f5151e9c87e7c7e87b400c901699b7) The keyboard is a toy keyboard now, case and all
- [`9bca37d`](https://github.com/cmdcolin/bender/commit/9bca37d899656d37465266d06706c7765c8ca2ec) A key answers the pointer, and the badge counts the keys it has
- [`1bdb542`](https://github.com/cmdcolin/bender/commit/1bdb5424ddf89d8a2f484c3cde0c15fc73ca6d0b) The kit counts its envelopes off the clock it counts the tempo off
- [`e901fae`](https://github.com/cmdcolin/bender/commit/e901fae23e1b17e13feeb8d9e284822c3ff03e75) One noise transistor on the board, not three
- [`b7055db`](https://github.com/cmdcolin/bender/commit/b7055dbf618b09d4402128f550cc0920c8a79448) A knife through the wires between the counter and the pattern memory
- [`3cafeab`](https://github.com/cmdcolin/bender/commit/3cafeab30127c32f7be367cc2aa6b7d31f5e3509) Flat plastic: the shapes carry the toy, not the shading
- [`d20cd47`](https://github.com/cmdcolin/bender/commit/d20cd47220c9f0cfe5dd625a6937c0166988a5c7) The doc says what a control is for, not just what its numbers are
- [`616df99`](https://github.com/cmdcolin/bender/commit/616df9989ced77466d03379e4fa762b788d1e29c) A one-shot behind each voice, and an accumulator that rolls over
- [`871fe7b`](https://github.com/cmdcolin/bender/commit/871fe7b3855a499dfad3db520d48e90c898e3dc8) The springs come back on their own fader instead of eating the dry
- [`5e421c1`](https://github.com/cmdcolin/bender/commit/5e421c13b35cf8d7cc33753fd0d7e12812cbaa10) The sine is a table, and a table is an address
- [`7cd2cc3`](https://github.com/cmdcolin/bender/commit/7cd2cc38c0c6d507b6e5b58b17967adc35e1f59e) The tables fold, and every preset is a board you can open
- [`c2a298d`](https://github.com/cmdcolin/bender/commit/c2a298dbb79ccf42cbd1418b281d1cde62743b02) The path at the top of the page, and a suite that runs in a worktree
- [`d4b11fd`](https://github.com/cmdcolin/bender/commit/d4b11fdb76246689725d01654bb036945f4bfec6) The sources are six boxes now, and the map says what feeds what
- [`8feb798`](https://github.com/cmdcolin/bender/commit/8feb7984b68dd7d7b4f521706b560c10c7b38c88) The grid, the shy ones, and a pointer that says what the page is now

## [0.6.0](https://github.com/cmdcolin/bender/compare/v0.5.0...v0.6.0) - 2026-08-18

### Other Changes
- [`f651352`](https://github.com/cmdcolin/bender/commit/f6513528d58fcc306e9d430cbf78ae636d969b2c) A running effect keeps the patch, instead of losing it on the first block
- [`495d5b4`](https://github.com/cmdcolin/bender/commit/495d5b4e594fe29b0b85c41b43fe1f27195267bc) Slip the strobe and nothing is corrupted, only misfiled
- [`6690764`](https://github.com/cmdcolin/bender/commit/6690764e870a61599a8c6801ff4b073629d0ba56) Three knobs stopped short of what the engine already did
- [`0e6c83c`](https://github.com/cmdcolin/bender/commit/0e6c83c5843e505be664d0f1ec80033861a6333a) Five more knobs that stopped inside their own stage's clamp
- [`23d1094`](https://github.com/cmdcolin/bender/commit/23d10941c5732e4538f0802b8e504fa6aa9968c9) The kit's tune trimmer already went an octave either side of its knob
- [`aa66d20`](https://github.com/cmdcolin/bender/commit/aa66d20b36976d09e70ce84a2faf814f527b0fd6) The number beside a stage is the way back to where it booted
- [`9ac25bc`](https://github.com/cmdcolin/bender/commit/9ac25bc38ce3c237ae5e351280c0f8ed5c10075a) The effects are reachable now, by hand and by dice
- [`f7cc7c4`](https://github.com/cmdcolin/bender/commit/f7cc7c4993526a50ac51677085e23107965fdbf0) A button is as wide as its label and no wider
- [`1b5a980`](https://github.com/cmdcolin/bender/commit/1b5a980650b06232c87af45a33eafeb1edadb359) A reload comes back running what the tab was running
- [`6fa27b5`](https://github.com/cmdcolin/bender/commit/6fa27b5227780d4ffd2d358d1de3e1b8d35e0cbd) The echo comes back on its own fader instead of eating the dry
- [`554ad00`](https://github.com/cmdcolin/bender/commit/554ad0012a4bd23235ffaf62c98188e16fa97365) The panel's own tooltip, instead of the one the browser draws
- [`c11e806`](https://github.com/cmdcolin/bender/commit/c11e8066f202164fdf011e1f6120502fd3cd6030) The numbers the board was built out of are knobs now

## [0.5.0](https://github.com/cmdcolin/bender/compare/v0.4.2...v0.5.0) - 2026-08-18

### Other Changes
- [`188350d`](https://github.com/cmdcolin/bender/commit/188350dfd14ae3a0fc50563f9076b8c7935a7c77) MIDI knobs turn the board's controls
- [`25b80a9`](https://github.com/cmdcolin/bender/commit/25b80a9c987e6b8f301fc29033deb1dfabc196e4) The flutter walk stops coasting into denormal range
- [`9ccd46f`](https://github.com/cmdcolin/bender/commit/9ccd46f4d2bee09be2c167e3a40bece112ee8979) An emptied socket lets go of the break it was holding
- [`b89c02b`](https://github.com/cmdcolin/bender/commit/b89c02bb28f30ef65d20d208af7e183137906c19) The bench says which bends are in the rack
- [`fe46419`](https://github.com/cmdcolin/bender/commit/fe46419dbdb78d8a8dc8a6c91fdc3da9094dc054) Three carriers that stop calling libm every sample
- [`73d2f42`](https://github.com/cmdcolin/bender/commit/73d2f42627ed8c72f0c6caa1d81ae6cee58483a4) The map goes back to waiting for the board to settle
- [`e6ec4ea`](https://github.com/cmdcolin/bender/commit/e6ec4ea65f0564a23adfee75be75043d00809ea4) Four small ones: the trace, the jack, the listeners and a dead branch
- [`573b9c3`](https://github.com/cmdcolin/bender/commit/573b9c3f3a23192abd7b8fd40a050454dc9148c3) The supply gets a capacitor, so a starve dives instead of arriving
- [`4a76f38`](https://github.com/cmdcolin/bender/commit/4a76f3876e945b689296e7350c35017cd16842d2) A preset and a roll that can find the paperclip on their own
- [`b389fe1`](https://github.com/cmdcolin/bender/commit/b389fe18e7788af31694e38c9fb7effe95b252d3) Endless encoders, lit rings, velocity, and knobs that say they are waiting
- [`f998b36`](https://github.com/cmdcolin/bender/commit/f998b36fb44fd91c6da722055cc41d9f1479801f) The clip can land on the timing pin, where octaves live
- [`b6cd989`](https://github.com/cmdcolin/bender/commit/b6cd989bc1783a9de4b9c0c0b5043c904dfb518a) Crackle is shy: a roll brings it on rarely, and low
- [`2f56f1b`](https://github.com/cmdcolin/bender/commit/2f56f1bc62e4e7696b368f8790f7bcf8f4ca9501) Pitch and tempo are one oscillator, so they stop coming apart
- [`81c95a0`](https://github.com/cmdcolin/bender/commit/81c95a05a0d9d205fd33d2457b93f164ecd70135) The octave switch reaches two down as well as two up
- [`3147e8b`](https://github.com/cmdcolin/bender/commit/3147e8b452fb8d85f2412e112b54d73c9bb9affa) The wire says what it is carrying, and the panel says it is there
- [`e872313`](https://github.com/cmdcolin/bender/commit/e8723130ac8b19a503cfbe90039a0aa404bbd4bb) A through port is not a controller, so the rings stay dark on it
- [`dae55ae`](https://github.com/cmdcolin/bender/commit/dae55aee1143ab235653059a4ca0c8b875c2b6b5) The board rides in the hash, and a pasted one arrives
- [`9a98b0c`](https://github.com/cmdcolin/bender/commit/9a98b0cb70857fa093b7abb89362ca8a66391d22) The keyboard on the screen lights for whatever is playing it
- [`2c03ca9`](https://github.com/cmdcolin/bender/commit/2c03ca94d63084534a37ab4e7927238a20352aa1) The drawn keyboard plays the note it draws, and lights for the toy as well
- [`3d7b234`](https://github.com/cmdcolin/bender/commit/3d7b234457db6b5857d6fe8493c493d8a5e9bb3b) Notes that nothing lets go of, let go of
- [`9261356`](https://github.com/cmdcolin/bender/commit/926135646513ef5b1028e094537254d0ab89b7eb) Noise off a table, the tank flat, and nothing allocated on the audio thread
- [`f04b5d2`](https://github.com/cmdcolin/bender/commit/f04b5d256776fe89a16a38f38dc4cfdd6d2f5fa5) The moving taps truncate instead of calling floor
- [`07f438d`](https://github.com/cmdcolin/bender/commit/07f438dda5c3da08b9b57b31915801bd269ea2cb) The heads keep their filters in hand, and the phases stop calling fmod
- [`2496482`](https://github.com/cmdcolin/bender/commit/2496482321446c1a214bf372444167cbd1025219) Octaves off exp, an A/B that knows what a coin looks like, and the first five seconds
- [`7a4a88f`](https://github.com/cmdcolin/bender/commit/7a4a88f3221cd36eaa5eb65e7d89e7ce9f38d565) Three docs, and the inventory counts the board rather than remembering it
- [`c10d7d4`](https://github.com/cmdcolin/bender/commit/c10d7d4453417e39d518124a29991c4821887432) The note report hands over its buffer instead of a slice of it
- [`8431615`](https://github.com/cmdcolin/bender/commit/843161579ce8a2857797527b2dc522cea7216a1b) A knife through the ROM bus plays a different song, not a broken one
- [`ef55afa`](https://github.com/cmdcolin/bender/commit/ef55afa6f96d728070c9a74c94e1ced5b40c1b9b) The kit's converter is built from resistors nobody measured
- [`3d304fb`](https://github.com/cmdcolin/bender/commit/3d304fb4d422e1f1918a86d38655b02088ee697d) The other chip is configured rather than played, so a cut wire persists
- [`1a5f138`](https://github.com/cmdcolin/bender/commit/1a5f138ed0a2c51989ca013682f20f5d5d1ec181) A pad is a drum, and channel 10 needs no telling
- [`610a4d7`](https://github.com/cmdcolin/bender/commit/610a4d723d981ed6c8e8a05cc857be330fb61839) The kit lights for whatever strikes it, and takes what you play in
- [`70d29b6`](https://github.com/cmdcolin/bender/commit/70d29b607f6c186d2ec08ae83527633d5e8d306c) An arm nothing commits is an arm the next gesture banks
- [`95d332c`](https://github.com/cmdcolin/bender/commit/95d332cf71e46f56d829c1ab95fd8fd2dd61a5bb) The effect ROM is a program spraying writes, not a sample
- [`6a34ede`](https://github.com/cmdcolin/bender/commit/6a34ede92ffdb17604c9921a8445d260b19fdad6) The cricket loop strikes six times, not five
- [`adf917b`](https://github.com/cmdcolin/bender/commit/adf917b32a2f2e8128df66325228ce914d690298) The kit's half of the wire is a different instrument, so it gets its own file
- [`7b1dd6f`](https://github.com/cmdcolin/bender/commit/7b1dd6f1d002b742eb0b700bef875c48beb27b2f) A hat that came out on the wrong pad is one voice, not six
- [`74cac6c`](https://github.com/cmdcolin/bender/commit/74cac6cac1f6891078670f451547e6bf2e27c441) Armed with the kit stopped is a real state, and a silent one

## [0.4.2](https://github.com/cmdcolin/bender/compare/v0.4.1...v0.4.2) - 2026-08-17

### Other Changes
- [`0caf1cd`](https://github.com/cmdcolin/bender/commit/0caf1cd0764b890ca93174e2e2c8d3d7fe3bb104) The roll buttons say random, and look like buttons

## [0.4.1](https://github.com/cmdcolin/bender/compare/v0.4.0...v0.4.1) - 2026-08-17

### Other Changes
- [`a6048fb`](https://github.com/cmdcolin/bender/commit/a6048fb6ca0b5ca9899557113e2de58aaf680a66) The kit boots audible, so play drums plays drums
- [`104d62e`](https://github.com/cmdcolin/bender/commit/104d62e3917ab645e7530334cd7fb02d9fa0925d) Panic says what it kills, and the URL is the share button

## [0.4.0](https://github.com/cmdcolin/bender/compare/v0.3.0...v0.4.0) - 2026-08-17

### Other Changes
- [`d15e0eb`](https://github.com/cmdcolin/bender/commit/d15e0eb5c06fdf4e71b11bc670cd669b10682c11) A bench for what the board costs per block
- [`bf9e819`](https://github.com/cmdcolin/bender/commit/bf9e81923baf005c6987f84840b2db97a4bd7d64) Mask the ring, settle the fixed taps, and stop calling libm for a soft clip
- [`1b767f4`](https://github.com/cmdcolin/bender/commit/1b767f4d0e9d8e33db8f55a92235abdee4c2ea3f) A sine that costs two multiplies, for the transports that wobble
- [`3dd594b`](https://github.com/cmdcolin/bender/commit/3dd594bb9ca1aed36e6ddf70b470ba2d5515b674) Nothing new per block: the joint, the wires and the falls all sit still
- [`b19b7d3`](https://github.com/cmdcolin/bender/commit/b19b7d39f0af335be9ac0dc7812b129bfdf8427d) The panel stops redrawing itself sixty times a second while a board travels
- [`9797e76`](https://github.com/cmdcolin/bender/commit/9797e76b725ce563bdec70966102ca3987aca12b) A bench script anyone can run, and what its number means
- [`6343ed7`](https://github.com/cmdcolin/bender/commit/6343ed7287bb6b7c936b640c1ca0f76edb92a197) The toy stops getting slower the longer you leave it on
- [`7b67de6`](https://github.com/cmdcolin/bender/commit/7b67de63efaf3e6c553ad50c97e106a0d0998e0f) A soak run, and what to watch in it
- [`9eeeaf1`](https://github.com/cmdcolin/bender/commit/9eeeaf112f962453e9d5b96a0b6b137f4dd6864e) Draw the signal path ourselves, and drop a megabyte of wasm graphviz

## [0.3.0](https://github.com/cmdcolin/bender/compare/v0.2.0...v0.3.0) - 2026-08-17

### Other Changes
- [`569cad3`](https://github.com/cmdcolin/bender/commit/569cad3ae1c32e5b51e73c82f82643440e862ab1) A bridged envelope falls on its own, and the block loop stops allocating
- [`de58756`](https://github.com/cmdcolin/bender/commit/de58756fc3921052395722e867756c5cdf982708) The trigger patch: the kit fires the keyboard, and the keys fire the kit
- [`3ace96c`](https://github.com/cmdcolin/bender/commit/3ace96c368d65fa6ff6b96aef9cbc16c39f5d832) the trigger patch
- [`b1e4009`](https://github.com/cmdcolin/bender/commit/b1e40091679e78e028f53a37ca96c16a3e9ca9ff) Stop paying per sample for arithmetic the block already knows
- [`ac38c52`](https://github.com/cmdcolin/bender/commit/ac38c52067340dd25fbeb41b457f2572c2fed0a2) The keys reach an octave under the toy and two above it
- [`60fd2ed`](https://github.com/cmdcolin/bender/commit/60fd2eddd8881340d8e1fbf7e0fbaa96855079f0) The backing band walks with a drum-clocked step
- [`a2e17d7`](https://github.com/cmdcolin/bender/commit/a2e17d72ef2dcbec41b70ca500642673dde1ea69) A note under the toy's bottom key still reaches the trigger line
- [`38e85d2`](https://github.com/cmdcolin/bender/commit/38e85d20c0028ed7eb002ce5ee9ea6157b1f4d4b) Three octaves on the board, with the letters printed on the keys
- [`68ed4d8`](https://github.com/cmdcolin/bender/commit/68ed4d81c8954c30257dc6566974f9585aa00903) Chaos mechanisms: clustered faults, heat, latch-up, a second bus
- [`cd2b8ff`](https://github.com/cmdcolin/bender/commit/cd2b8ffeacf66a247cd0a45b2059e5d633de5e94) Sparse rolls, three new scenarios, and a watchdog that can actually trip
- [`6f3b7b4`](https://github.com/cmdcolin/bender/commit/6f3b7b421af423463fee0ec8c5408adfffaf9b4b) the ageing section, and the bends that came with it
- [`c65dc8e`](https://github.com/cmdcolin/bender/commit/c65dc8e34ab32e72f4ee35412adb51e5bef2524b) the one roll that listens to what it rolled
- [`2756755`](https://github.com/cmdcolin/bender/commit/275675598bc2d25a86c7becbf0a19f40f2822f0f) Split the control table into one file per place on the board
- [`2159817`](https://github.com/cmdcolin/bender/commit/21598170ba57ead24af83b23dc915fdb6236cb76) Split presets into the table and one file per kind of roll
- [`89b54a6`](https://github.com/cmdcolin/bender/commit/89b54a6fb8d76e46792949949b36f35a85d818d4) The supply under the patch bay
- [`2908bf9`](https://github.com/cmdcolin/bender/commit/2908bf93c356d570c42c1d9366c9312ea8e02940) Four wires in the bay
- [`55ac6eb`](https://github.com/cmdcolin/bender/commit/55ac6ebcb4244b020a96384901b0865ceddc7151) A length per row: the kit stops looping
- [`79b8850`](https://github.com/cmdcolin/bender/commit/79b88500320b907fa06dd57e113976953a19cc1f) Something to strike the sampler with
- [`7d9ba87`](https://github.com/cmdcolin/bender/commit/7d9ba878b1359769f26008425f53e5c924fc68fd) Show the rail
- [`9969c21`](https://github.com/cmdcolin/bender/commit/9969c216c01c9832b801d79c459a697fdad846e0) the board plays itself
- [`364db31`](https://github.com/cmdcolin/bender/commit/364db316cef0641d3e4e04e497389a2a95680a66) Lock the toy to the kit, and a pass for fingers
- [`c20667d`](https://github.com/cmdcolin/bender/commit/c20667d42d74ee2395daec0143ebd638d42d220b) One clamp for a row length, and import order
- [`abeb618`](https://github.com/cmdcolin/bender/commit/abeb6182077a1b3d7fbcd781dc511d67c068b7b6) Split the stage tests into one file per thing they test
- [`78804ef`](https://github.com/cmdcolin/bender/commit/78804efe5a5852a9b1e8e677868c72abad87b890) Split the preset tests to match the three modules
- [`38fe6af`](https://github.com/cmdcolin/bender/commit/38fe6af994d4ab0be248b4f4630c11f24a427f2b) Name the bends once, and say what a mix is
- [`40ea3a8`](https://github.com/cmdcolin/bender/commit/40ea3a89af3b2684e98e20198acca389e2319336) Pin the trigger tails to the labels they decode
- [`0c2427d`](https://github.com/cmdcolin/bender/commit/0c2427dc10dde4e581efadaf8538d13d3d07bd66) Bump deps

## [0.2.0](https://github.com/cmdcolin/bender/compare/v0.1.1...v0.2.0) - 2026-08-17

### Other Changes
- [`5874a7b`](https://github.com/cmdcolin/bender/commit/5874a7b4a2c4b402ad8486fed0f4957fb36ebb6a) Nudge the board without knocking it out of time
- [`1f93aa1`](https://github.com/cmdcolin/bender/commit/1f93aa1e0c84fd2aa1000178d6c14c48de155c5e) Every preset is a fader: drag one part of the way there
- [`6ec4e89`](https://github.com/cmdcolin/bender/commit/6ec4e898c508e66da9bc3ef7721c421cfde9933e) Every setting a door on the map, and a shelf for what the path can't hold
- [`7e45375`](https://github.com/cmdcolin/bender/commit/7e453754b8cd4e744fe8f4ed36042d97d9e4298e) Roll one stage at a time, and put one back
- [`ab1de63`](https://github.com/cmdcolin/bender/commit/ab1de63dc0b8e8c22a6de9716b8578dd8055456a) Put the shelf back in React: the map reports its doors, the panel lays them out
- [`3140fc0`](https://github.com/cmdcolin/bender/commit/3140fc0956ccf516a7dd4934cc7e5578d169017c) Two machines, two run switches — and neither starts itself
- [`a7dbf79`](https://github.com/cmdcolin/bender/commit/a7dbf7903ce6a44f909d6b15d752097c4dd1ae7c) Flat cells: the floor the rail collapses from
- [`cb410f9`](https://github.com/cmdcolin/bender/commit/cb410f91ea07f5e6c7b863d8bdee643816f6db7f) Fit the whole instrument on one screen

## [0.1.1](https://github.com/cmdcolin/bender/releases/tag/v0.1.1) - 2026-08-17

### Other Changes
- [`8995014`](https://github.com/cmdcolin/bender/commit/89950144bfb5d2707ef28ef023e76e18100dcf8e) Initial empty commit
- [`a9a4f96`](https://github.com/cmdcolin/bender/commit/a9a4f96d11ed565a328d4bcb4b6db0b512020102) Scaffold vite + react + typescript
- [`cb4a8be`](https://github.com/cmdcolin/bender/commit/cb4a8be54c502a04a7dbb9120e4c81b19401a696) Control vocabulary and wire-format param table
- [`53a0907`](https://github.com/cmdcolin/bender/commit/53a0907b34cd74337c1569273d8423caf8a7b645) DSP core: chain skeleton, safety tail, smoother, slider schema, torture test
- [`edce2e3`](https://github.com/cmdcolin/bender/commit/edce2e36a43f23412381755520d3f274ebc98bab) All 15 DSP stages: toys on a shared starving rail, bends, pedals, feedback, brownout
- [`fc40401`](https://github.com/cmdcolin/bender/commit/fc40401c3fb013fcbe5ec1669d9f29568a6dee6e) Worklet processor, engine, and full panel UI
- [`daed3d5`](https://github.com/cmdcolin/bender/commit/daed3d507f7083a853255cdcc6916366b90bce82) Morph presets and random looks into place; enums cut at morph start
- [`5fd4abe`](https://github.com/cmdcolin/bender/commit/5fd4abea9c93c937d4b373b1e4831b5dc0415af8) README
- [`e9956cb`](https://github.com/cmdcolin/bender/commit/e9956cb05b685ac5803570b0f935027559a8d931) Screech filter, feedback destination routing, sub-octave fuzz, ground hum
- [`a512185`](https://github.com/cmdcolin/bender/commit/a512185b89efcb169fe17b070bf21a544cdb702b) Play/pause button for the demo song; nothing plays until you press it
- [`7592e13`](https://github.com/cmdcolin/bender/commit/7592e13529a50422bfe0c6465f3698deb77de3a5) Draw the signal path with graphviz; deploy to GitHub Pages via CI
- [`3d36027`](https://github.com/cmdcolin/bender/commit/3d36027b620567d1df9ed718da8abfbd653e469c) Update README.md
- [`f2b6360`](https://github.com/cmdcolin/bender/commit/f2b636087f962ca404dd5570372d287e1686c373) Twelve-song ROM bank with per-ROM step rates and note holds; record to wav
- [`86fbf52`](https://github.com/cmdcolin/bender/commit/86fbf524f608f1b455ea63a53d81eb8a5a260763) README draws the signal path with graphviz too
- [`91f75e5`](https://github.com/cmdcolin/bender/commit/91f75e5ee63583b734d7c929a614c0f019bd194e) Six melancholy ROMs, envelope timed off the ROM clock, needle drops on step 0
- [`0af1d6b`](https://github.com/cmdcolin/bender/commit/0af1d6b925d8c27633787e047b91fbd223354994) Space runs the transport; presets and random audition themselves
- [`a37f2a5`](https://github.com/cmdcolin/bender/commit/a37f2a559d6913d99f9b951a603bb801d749f94a) Boot straight into the app; hold button; narrower keys; readable signal path
- [`4abfdbd`](https://github.com/cmdcolin/bender/commit/4abfdbdbbe043010efcf260642430097bd0c8e1f) Patch bay: two wires from LFO/supply/env/mic/body/feedback onto nine destinations
- [`fd28d94`](https://github.com/cmdcolin/bender/commit/fd28d94eddb1dd72bdb73c7a069d92cbcc3694eb) Body contact pad, patch wires on the chain map, presets and tests
- [`ef2f4c0`](https://github.com/cmdcolin/bender/commit/ef2f4c07b924ed18639f56ff995f593c952f9168) Four-voice keyboard with per-voice rail tolerance; tone selector taps the divider
- [`560637f`](https://github.com/cmdcolin/bender/commit/560637fa4aec11321af437b045267f66c53ee241) Add prettier config
- [`8370fec`](https://github.com/cmdcolin/bender/commit/8370fecceb86cc45d96c00eb57893064362a60fc) Foldable chain map, and a wider panel at a readable size
- [`d777b83`](https://github.com/cmdcolin/bender/commit/d777b83ebee93fa496bd70b746dada75cc1846f5) Show the build version in the panel masthead
- [`8c0b7cf`](https://github.com/cmdcolin/bender/commit/8c0b7cf8318fb68a0f763ebaeebb43f98e3b4fac) Auto bass-chord: the accompaniment section, harmonized off the melody
- [`7563401`](https://github.com/cmdcolin/bender/commit/7563401944df210f6b6938c48e08eec0f3a446a0) The map is the panel's index: click a stage to open its controls
- [`f07ff29`](https://github.com/cmdcolin/bender/commit/f07ff291d855f55a2d280c1abbead15e99201f3c) six pedal circuits, each clipping somewhere different
- [`a5a4e99`](https://github.com/cmdcolin/bender/commit/a5a4e99b5e6860243feda7f50eb6b5f8af789733) Update prettier
- [`e898a71`](https://github.com/cmdcolin/bender/commit/e898a710fe8649bd8d2c7a10b7f0f2a3dc2ed0af) Tape machine: the whole board printed to tape, after the brownout
- [`46c0990`](https://github.com/cmdcolin/bender/commit/46c09904d8594b0f00eefada075fabaa82b6311d) Three tape presets: a clean print, a shedding one, and the machine as the distortion
- [`f506924`](https://github.com/cmdcolin/bender/commit/f5069243ccf6c9e0badc1924a788618eb4c77f87) what the tape machine models and why speed is one part, not one knob
- [`24536de`](https://github.com/cmdcolin/bender/commit/24536de69acb56cf8d2dd915a0a731e773417089) Format the tape machine to the new prettier config
- [`9ac0712`](https://github.com/cmdcolin/bender/commit/9ac0712f0388ec0f6c9ba9477b884c70db6bda57) Format the tape machine files to prettier style
- [`bdfc3df`](https://github.com/cmdcolin/bender/commit/bdfc3df8766189047569f591bfe3c82c67747b1a) Cross-patch the drum voices: bridge two envelope pins and the kit fires wrong
- [`9eba0fc`](https://github.com/cmdcolin/bender/commit/9eba0fc1c04d235aeeecc0c35ecd8dda0d567cc1) Finish the bay: ROM step as a source, shift, word length and drum cross as destinations
- [`b64c355`](https://github.com/cmdcolin/bender/commit/b64c35586930d234e9864882de2a7d1d9176623c) Share a board as a link: every control off stock, by name, in the hash
- [`1769622`](https://github.com/cmdcolin/bender/commit/1769622d9ca264a0a5197cac017f5c2f343bc03a) Add format script
- [`c529260`](https://github.com/cmdcolin/bender/commit/c529260e9e154c995af33b48778fe7ec62f089ee) Keep the test run inside this checkout
- [`6d864a1`](https://github.com/cmdcolin/bender/commit/6d864a1b5653d6b9408fcd88b14018765c38b523) Make the body pad's unwired button open the patch bay
- [`8d59077`](https://github.com/cmdcolin/bender/commit/8d59077154c40df81b8f11598c5dccd37a79071f) Morph on every whole-board verb, and a way to stop one half way
- [`0f9db98`](https://github.com/cmdcolin/bender/commit/0f9db98930c160a881f9039b0dd0148294bb1d42) Keep the board in the address bar, not just behind the share button
- [`2121a7f`](https://github.com/cmdcolin/bender/commit/2121a7fde740c9f3af946840751c4cd29c0585f2) Keep the feedback bus on the map, and make its wire the door in
- [`5340b80`](https://github.com/cmdcolin/bender/commit/5340b80624a066ac3cc31aa58dafe063a44e5e70) An undo walk over boards, retraceable in both directions
- [`37427fc`](https://github.com/cmdcolin/bender/commit/37427fc143db37a5563b068e99499b0dd3f0a778) Format
- [`ba4ef74`](https://github.com/cmdcolin/bender/commit/ba4ef7400f83cc62da23f9bd48b648c1adbcfd34) Add pre-commit hook that formats staged files with prettier
- [`8945370`](https://github.com/cmdcolin/bender/commit/89453707bd912e5e6652203b8a4a6e28b1139a4a) A sixteen-step grid for the drum machine, and six voices to put on it

