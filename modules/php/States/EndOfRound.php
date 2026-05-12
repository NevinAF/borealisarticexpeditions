<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\States\EndScore;

class EndOfRound extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 13,
            type: StateType::GAME,
            name: 'endOfRound',
        );
    }

    public function onEnteringState(?int $activePlayerId = null)
    {
        $g = $this->game;
        $g->deactivateClaimedObjectives();
        $this->bga->notify->all('endOfRound', clienttranslate('End of round'), []);
        if ($g->anyLocationHasSevenPlusCards()) {
            return EndScore::class;
        }
        $leader = $g->getRoundLeaderId();
        $g->gamestate->changeActivePlayer($leader);
        $g->updateObjectiveConditions();

        return Gameplay::class;
    }
}
