# Borealis: Arctic Expeditions \- BGA Tasks

This document is a task list of required and optional steps needed to develop *Borealis: Arctic Expeditions* on Board Game Arena.

## Overview

**First Playable** \- 30 hours *\- full functionality*  
**Minimal Beta** \- 50 hours \- *bga requirements and testing/issues*  
**Robust Beta** \- 70 hours *\- improved ux/ui*  
**Maximal Beta** \- 120 hours \- *as good as possible*

*Times are subject to change based on*

- User Bugs  
- Publisher Requests (changes)  
- Communication (updates, verifications, feature discussions, if desired)  
- Playtesting (setup/help or playing actual games)

## Game Logic (Server-side and Data)

The core features of the server. The server manages the game state and game flow. It does not include any presentation or interaction.  
I (Nevin Foster) estimate around **30 hours to complete**. A full first playable might take about 15 hours, omitting most objectives, scoring cards, and validations (error handling and anti-cheat). The completed code would contain well-formatted and extendable code with a failsafe design to accommodate client issues. Code formatting and validations are required for games on BGA to enter Beta testing and eventually get a full release.

- [x] ~~Components (2h): Creating data representations for all game components.~~  
      - [x] ~~(5) Player boards (the locations) \- (1) A side, (4) B side~~  
      - [x] ~~(100) Animal Cards~~  
      - [x] ~~(12) Objective Cards~~  
      - [x] ~~(10) Scoring Cards~~  
- [x] ~~Play Area (1h): Creating a data representation of the state of the game; this is mostly the location of game components. *Below is a rough reference for the components mentioned in the following tasks*~~  
      - [x] ~~(1) Animal Deck (container of animal cards)~~  
      - [x] ~~(1) Animal Discard (ordered-container of animal cards)~~  
      - [x] ~~(1) Pool of available cards (container of animal cards) *(probably ordered so they show the same way in the presentation)*~~  
      - [x] ~~(P) Player Hand (container of animal cards)~~  
            - [ ] *Maybe order and allow saving the preferred order? Maybe only order on client side, lose on reload?*  
      - [x] ~~(P\*3) Location:~~  
            - [x] ~~Counter for the flag position~~  
            - [x] ~~Container of scientists~~  
            - [x] ~~Ordered-container for animal cards.~~  
      - [x] ~~(P\*2) Camp (Container of scientists)~~  
      - [x] ~~(P) Score (counter for ‘VP’)~~  
      - [x] ~~(3) Objectives:~~  
            - [x] ~~Foreach player: “Claimed”/”Meets”/”Fails”~~  
            - [x] ~~True/False if “active”~~  
      - [x] ~~(2) Scoring Cards. *(This is constant throughout the game, but shows the ‘picked’ scoring cards)*~~  
- [x] ~~\[FUNCTION\] Draw from Animal Deck (\<1h):~~  
      - [x] ~~IF animal deck is empty, MOVE all animal cards in the animal discard to the animal deck.~~  
      - [x] ~~RETURN a random card from the animal deck.~~  
- [x] ~~\[FUNCTION\] Update Objective Conditions (6h)~~

      *Note, this has a high development time to implement the specifics for each objective.*

      - [x] ~~FOREACH objective and FOREACH player:~~

            *TODO: Do we set the player to “fails” if they did meet the condition but no longer do?*

            - [x] ~~If the player is set to “Fails” for the objective, IF the player meets the conditions, SET the player to “Meets” for the objective.~~  
      - [x] ~~(objectives)~~  
            - [x] ~~Specialists’ Retreat~~  
            - [x] ~~*… (not in rules)*~~  
- [x] ~~\[FUNCTION\] Next Player (1h):~~  
      - [x] ~~IF the active player is the last in the round, SWITCH to “End of Round.”~~  
      - [x] ~~IF the active player is not the last in the round~~  
            - [x] ~~Set the active player to the next player in turn order.~~  
            - [x] ~~SWITCH to “Gameplay.”~~  
- [x] ~~\[LOGIC-STATE\] Setup (1h): Initializing the play area and distributing components. Includes shuffling cards, picking objectives, and selecting starting playout.~~  
      - [x] ~~SET active player to the first player.~~  
      - [x] ~~SWITCH to “Gameplay.”~~  
- [x] ~~\[ACTION-STATE\] Gameplay (1h):~~  
      - [x] ~~\[ACTION\] Observe An Animal (2h): Given a player, animal card, and location:~~  
            - [x] ~~VERIFY the player is the active player.~~  
            - [x] ~~VERIFY the player is holding the animal card.~~  
            - [x] ~~VERIFY the location belongs to the player.~~  
            - [x] ~~VERIFY the location has the scientists listed on the animal card.~~  
            - [x] ~~MOVE the scientists listed on the animal card~~  
            - [x] ~~IF the animal card vehicle matches a vehicle on the next flag space on location, MOVE the flag down one space~~  
            - [x] ~~SWITCH to “Replenish Animal Card”~~  
      - [x] ~~\[ACTION\] Regroup (\<1h): Given a player and a set of animal cards:~~  
            - [x] ~~VERIFY the player is the active player.~~  
            - [x] ~~VERIFY the set of animal cards is unique.~~  
            - [x] ~~FOREACH of the animal cards, VERIFY the card is in the player’s hand.~~  
            - [x] ~~MOVE all of the animal cards to the animal discard.~~  
            - [x] ~~FOREACH of the animal cards, MOVE an animal card returned from “Draw from Animal Deck” to the player’s hand.~~  
            - [x] ~~FOREACH scientist in the player’s camps, ADD 1 ‘VP’ to the player’s score.~~  
            - [x] ~~SWITCH to “Assign Camp Scientists”~~  
- [x] ~~\[ACTION-STATE\] Replenish Animal Card (1h):~~  
      - [x] ~~\[ACTION\] Observe An Animal \> Take An Available Card (1h): Given a player and animal card:~~  
            - [x] ~~VERIFY the player is the active player.~~  
            - [x] ~~IF the animal card is undefined:~~  
                  - [x] ~~MOVE an animal card returned from “Draw from Animal Deck” to the player’s hand.~~  
            - [x] ~~IF the animal card is not undefined:~~  
                  - [x] ~~MOVE the animal card to the player's hand.~~  
                  - [x] ~~MOVE an animal card returned from “Draw from Animal Deck” to the “pool of available cards.”~~  
            - [x] ~~PREFORM “Next Player”~~  
      - [x] ~~\[ACTION\] Observe An Animal \> Mulligan the pool of available cards (\<1h): Given a player:~~  
            - [x] ~~VERIFY the player is the active player.~~  
            - [x] ~~VERIFY the player has at least one ‘VP’~~  
            - [x] ~~MOVE all animal cards in the “pool of available cards” to the animal discard.~~  
            - [x] ~~DO 4 TIMES, MOVE an animal card returned from “Draw from Animal Deck” to the “pool of available cards.”~~  
            - [x] ~~SWITCH to “Replenish Animal Card”~~  
- [x] ~~\[ACTION-STATE\] Assign Camp Scientists (1h):~~  
      - [x] ~~\[ACTION\] Regroup \> Assign Camp Scientists (\<1h): Given a player and a location:~~  
            - [x] ~~VERIFY the player is the active player.~~  
            - [x] ~~VERIFY the location belongs to the player.~~  
            - [x] ~~FOREACH scientist in the player’s camps, MOVE to the location.~~  
            - [x] ~~PREFORM “Next Player”~~  
- [x] ~~\[ACTION (anytime)\] Claim an Objective (1h): Given a player and an objective:~~

      *TODO: How do we make sure the client has time to claim the objective before the round ends, especially if they are the last player? We should avoid ‘timed’ events, like giving a buffer (network complications), but do we want to automatically claim objectives?*

      - [x] ~~VERIFY the objective is active.~~  
      - [x] ~~VERIFY the player “meets” the objective. (also checks if already claimed)~~  
      - [x] ~~FOREACH player:  (automatically claim for anyone who forgot or hasn’t)~~  
            - [x] ~~If the player “meets” the objective.~~  
            - [x] ~~ADD 5 ‘VP’ to the player’s score.~~  
- [x] ~~\[LOGIC-STATE\] End of Round (1h):~~  
      - [x] ~~FOREACH objective, IF ANY player “claimed” the objective, SET objective active to false.~~  
      - [x] ~~IF ANY location has 7 or more animal cards, SWITCH to “End of Game.”~~  
      - [x] ~~IF ALL location have 6 or fewer animal cards~~  
            - [x] ~~SET active player to the first player.~~  
            - [x] ~~SWITCH to “Gameplay.”~~  
- [x] ~~\[LOGIC-STATE\] End of Game (6h):~~

      *Note, this has a high development time to implement the specifics for each scoring card.*

      - [x] ~~FOREACH location~~  
            - [x] ~~ADD ‘VP’ to the location’s player based on the sets of animal cards.~~  
            - [x] ~~ADD ‘VP’ to the location’s player based on the flag location~~  
            - [x] ~~ADD ‘VP’ to the location’s player equal to the total ‘VP’ on animal cards.~~  
      - [x] ~~Scoring Cards~~  
            - [x] ~~Common Destination~~  
            - [x] ~~Expansive Species~~  
            - [x] ~~Farewell Party~~  
            - [x] ~~Interspecies Relationships~~  
            - [x] ~~Mating Season~~  
            - [x] ~~Outer Lands~~  
            - [x] ~~Popular Vehicle~~  
            - [x] ~~Safe Return~~  
            - [x] ~~Territorial Animals~~  
            - [x] ~~Untrodden Path~~  
      - [x] ~~Tie Breaker~~  
            - [x] ~~Flag furthest down~~  
            - [x] ~~Most ‘VP’ Tokens~~

## Game Presentation (Client-side Interface and Interaction)

The core features for the user webpage. The user webpage presents the current game state and uses interactive elements to execute player actions. It does not define how the player's actions change the game state.  
I (Nevin Foster) estimate around **11 hours to complete**. The completed code would contain the bare minimum needed for a user to play a game and serve as a first playable milestone.

- [x] ~~Components (5h)~~

      *Images should not contain text, as it would violate the BGA translations requirement. This also helps with tooltips and prevents ‘visual not matching data’.*

      - [x] ~~Fonts~~  
      - [ ] Icons/Tokens  
      - [x] ~~Animal Card Images~~  
      - [x] ~~Animal Card Layout~~  
      - [x] ~~Objective Card Layout~~  
      - [x] ~~Scoring Card Images~~  
      - [x] ~~Scoring Card Layout~~  
- [x] ~~Play Area (5h)~~  
      - [x] ~~Location Layout~~  
            - [x] ~~Animal Cards~~  
            - [x] ~~Scientists~~  
            - [x] ~~Flag and Exploration Track~~  
      - [x] ~~Player Board Layout~~  
            - [x] ~~Locations~~  
            - [x] ~~Camps~~  
      - [ ] Table Layout  
            - [x] ~~Objective~~  
            - [x] ~~Scoring Cards~~  
            - [x] ~~Player Boards~~

                  *TODO: Do we hide the other player boards? This is standard, but will make it hard to visually see what happens on their turn. Perhaps, switch to “their view” automatically when something changes. [Check out Through the ages for example](https://www.youtube.com/live/RuQDfwkk3eE?si=ZrlUy6-HCvnQDfgw&t=6184)*

            - [ ] “Help” \- Player aid card, scoring, rules..  
            - [x] ~~Player Cards *(BGA has default cards that show in the right; these should be partially duplicated on the matching player boards).*~~  
                  - [x] ~~Player Name~~  
                  - [x] ~~Player Score~~  
- [x] ~~\[ACTION\] Observe An Animal (0h):~~

      *Because “Replenish Animal Card” always comes next, we do not need to confirm this action. Instead, only commit when “Replenish Animal Card” is initiated in some way.*

      - [x] ~~Click/Tap animal card \- toggle selected~~  
      - [x] ~~Click/Tap location \- switch to ‘this location selected’, unselecting other locations and camps~~  
      - [x] ~~IF one animal card is selected and a location is selected, click/tap “confirm observation” \- commit action~~  
- [x] ~~\[ACTION\] Observe An Animal \> Take An Available Card (0h):~~   
      - [x] ~~Click/Tap animal card or animal deck~~  
- [x] ~~\[ACTION\] Observe An Animal \> Mulligan the pool of available cards (\<1h):~~ 

      *TODO: What is the best way to handle this? Dedicated button next to the row? Should we also allow clicking on point tokens (if displayed)?*

      - [x] ~~Click/Tap *something*~~  
- [x] ~~\[ACTION\] Regroup (0h):~~  
      - [x] ~~Click/Tap animal card(s) \- toggle selected~~  
      - [x] ~~Click/Tap Camp \- switch to ‘camps selected’, unselecting locations~~  
      - [x] ~~IF ‘camps selected’, click/tap “confirm regroup” \- commit action~~  
- [x] ~~\[ACTION\] Regroup \> Assign Camp Scientists (0h):~~  
      - [x] ~~Click/Tap location \- switch to ‘this location selected’, unselecting other locations~~  
      - [x] ~~IF location is selected, click/tap “confirm location” \- commit action~~  
- [x] ~~\[ACTION\] Claim an Objective (0h):~~  
      - [x] ~~Click/Tap objective \- commit action~~

## Housekeeping

For all BGA games, these are the additional tasks needed to create and release a game.

- [x] ~~Create a new game project (1h)~~  
      - [x] ~~Generate an initial project from the BGA portal~~  
      - [x] ~~Version control and code sharing~~  
      - [x] ~~Preparing the dev environment, including setting up best practices like folder structure and TypeScript.~~  
- [x] ~~Game Info (3h)~~  
      - [x] ~~Game Config file, including player count, default colors, time profiles, tiebreaker rules, etc.~~  
      - [x] ~~Game Metadata, including designer, publisher, duration, complexities, dates, links, and more.~~  
      - [x] ~~Game Media (required for release and has strict format requirements)~~  
            - [x] ~~Box~~  
            - [x] ~~Icon~~  
            - [x] ~~Title~~  
            - [x] ~~Publisher Logo~~  
            - [x] ~~Banner~~  
            - [x] ~~(10) Display Images (“game in action” carousel)~~

## Optional Additions

This section is for all non-required features, focusing on the nice-to-haves.  
I (Nevin Foster) have provided a wide range of time required for these, as it can fluctuate greatly depending on the desired result. For example, “highlighting an icon” could be done by “showing a circle on/under” (fast/easy) or  “outlining the art” which could involve converting the icon to SVG to support outlines

- [ ] Statistics (0-5h) \- most can apply to a player and/or the table  
      - [ ] Score in each category  
      - [ ] Number of rounds  
      - [ ] Achievements  
      - [ ] Objectives completed  
      - [ ] Score Cards  
      - [ ] Downmost Flag  
      - [ ] Total Flag movement  
      - [ ] Distribution of animals \- types and locations  
      - [ ] …  
- [ ] Art (1h+)  
      - [x] ~~Convert (some) icons/art to SVG \- Faster loading, better support for effects, dynamic scaling without pixelation.~~  
      - [ ] Backgrounds and theming  
- [ ] Extra UI (\<1h)  
      - [ ] Round Number  
      - [x] ~~Cards Counts (deck, discard)~~  
      - [x] ~~Zoom in/out~~  
- [ ] Help  
      - [ ] Information panels (1h+)  
            - [ ] Show issues with selected cards  
            - [ ] Show what actions can/need to be taken  
            - [x] ~~Show ‘is final round’~~  
      - [ ] Tooltips or enlarged view (1-4h+)  
            - [ ] Animal Cards \- a text description of the visual content and effect  
            - [ ] Objectives \- Enlarge description and show all players’ completion progress  
            - [ ] Scoring Card \- Enlarge description, show explanations, show all players’ current score from card.  
            - [ ] Flag/Exploration Track \- Show current points, help with how to move  
      - [ ] Possible actions (1-10h+)  
            - [ ] Darken animal cards in hand that cannot be played anywhere  
            - [ ] Darken locations that cannot observe any animals from hand  
            - [ ] Brighten camps when no cards can be played  
            - [ ] Hover location to brighten cards that can be played there  
            - [ ] Hover the animal card to brighten locations where it can be played. This can work for cards in hand and out of hand  
            - [ ] Hover camps to brighten scientists and maybe show them being “picked up.”  
            - [ ] For animal cards that cannot be played in the selected location, outline the missing scientists in red  
      - [ ] Pattern Matching (1-3h+)  
            - [ ] Hover animal card to brighten matching vehicles on the exploration track.  
            - [ ] Hover animal card to brighten matching scientist type  
            - [ ] Hover exploration track position to brighten matching vehicles on animal cards  
            - [ ] Hover “vehicle icon” to highlight all matching vehicle icons.  
            - [ ] Hover “species icon” to highlight all matching species icons.  
            - [ ] Hover “scientist icon” to highlight all matching scientist types.  
- [ ] Action Previews (2h-15h+)  
      - [ ] Trails/Animations for how scientists will move if the “observation” occurs.  
      - [ ] Trails/Animations for how the flag will move if the “observation” occurs. Maybe highlight the flag in “blue” if matches and “red” if else.  
      - [ ] Trails/Animations for how scientists will be placed if the “assignment” occurs or “regroup” begins.  
      - [ ] Trails/Animations (or icons next to camps?) for point tokens for if “regroup” begins.  
      - [ ] Trails/Animations where selected cards will go  
      - [ ] When discarding for regroup, show the card going to discard (or away by tilting) AND show a card replacing it from the deck.  
- [ ] Interactions (1h-2h+)  
      - [ ] Drag\&Drop animal card on location \- clear all selections and select only the animal card and location  
      - [ ] Drag\&Drop animal card to discard (or off table?) \- clear location selection, select the camps, and select the dragged card for discard  
      - [ ] Drag\&Drop animal card from animal deck or “pool of available cards” on player hand to select (and auto confirm?)  
      - [x] ~~Click/Tap a location already with an animal card picked to confirm \- confirms without selecting the confirm button~~  
      - [x] ~~Click/Tap camps when already selected to confirm regroup \- confirms without selecting the confirm button~~  
      - [ ] IF regroup is started without any discards, allow for rollback (no new information given)  
- [ ] Action Resolutions: move components between the start and end locations, matching the updated game state. Also, this will need some form of sequencing if multiple things happen.  
      - [ ] Observe An Animal. (1h)  
            - [ ] Play a card from the hand  
            - [ ] Move Scientists  
            - [ ] Move Flag  
      - [ ] Observe An Animal \> Replenish Animal Card. (1h)  
            - [ ] Shuffle (if needed)  
            - [ ] Move the selected card to player hand.  
            - [ ] Shuffle (if needed)  
            - [ ] Replace the card taken (if needed).  
      - [ ] Observe An Animal \> Mulligan the pool of available cards. (1h)  
            - [ ] Discard cards  
            - [ ] Shuffle (if needed)  
            - [ ] Draw Cards  
      - [ ] Regroup. (1h)  
            - [ ] Discard Cards  
            - [ ] Shuffle (if needed)  
            - [ ] Draw Cards  
            - [ ] Show Scientists as “awaiting assignment.” (1h)  
      - [ ] Regroup \> Assign Camp Scientists. (1h)  
      - [ ] Claim an Objective (1h)  
            - [ ] Show objective as “claimed this round.”  
            - [ ] Show who gets points?  
      - [ ] End of Round (\<1h)  
            - [ ] “Disable” objectives  
      - [ ] End of Game (1h-4h+)  
            - [ ] Score Card  
            - [ ] Animate where the points are coming from  
- [ ] Player Card (2h)  
      - [x] ~~Number of animal cards at each location~~  
      - [x] ~~Position of flags on locations~~  
      - [ ] *Speculative scoring? This is generally not great to show for games, but it can be discussed*  
- [ ] Sound Effects (0h-4h+)  
      - [ ] Selecting cards  
      - [ ] Selecting locations  
      - [ ] Preforming actions  
      - [ ] Sounds to go along with animations  
- [ ] Gamelogs (3h+) \- shown on the right bar, listing the actions taken  
      - [x] ~~(default) include *what* happened (name of action). Ex: Observed an Animal~~  
      - [x] ~~Include *who* triggered the change. Ex: YOU Observed an Animal~~  
      - [ ] Include *where* the action took place. Ex: Observed an Animal at the left location.  
      - [x] ~~Include *how* it changed the game. Ex: Regrouped and were awarded 6 pts.~~  
- [ ] Game Options (2h)  
      - [ ] Choose the “animal objective.”  
      - [ ] Choose the “scientist objective.”  
      - [ ] Choose the “vehicle objective.”  
      - [ ] Choose “score card \#1.”  
      - [ ] Choose “score card \#2.”  
      - [ ] Choose player order.  
      - [ ] Choose Player Boards:  
            - [ ] “A Side Only”  
            - [ ] “Random B Sides”  
            - [ ] “Random A+B Sides”  
            - [ ] “Pick Boards” (3h, complex because this adds user action at the start of the game)  
- [ ] Preferences (1h)  
      - [ ] Change Animation speeds  
      - [ ] Enable/Disable Previews  
      - [ ] Enable/Disable confirm actions  
      - [ ] Confirm/Auto  
- [ ] BGA Game Tutorial (8h) \- Note, BGA users can create a tutorial, but it is not normally the best or complete.  
- [ ] Action Resolution Prediction (3h) \- Assume actions will be accepted by server, clear selections and prepare animation ahead of time to smooth selection/graphics.

## Miscellaneous

In the interest of completeness, here are some additional “task-like” items that don’t have specific timelines or requirements. Keep these in mind when estimating workload and planning release dates.

- [ ] Communication (2h+) \- meetings and emails  
- [ ] Documentation (3h+) \- including this document and code comments/readability.   
- [ ] User Bugs / Issues (0h+)  
- [ ] User Suggestions (0h+)