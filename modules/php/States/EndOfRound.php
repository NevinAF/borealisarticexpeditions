<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArcticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArcticExpeditions\Game;
use Bga\Games\BorealisArcticExpeditions\States\EndScore;

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
        $g->clearPendingObjectivePrompts();
        $endedRound = $g->getRoundNumber();

        $g->notifyAllWithBoardState(
            'endOfRound',
            clienttranslate('End of round ${round_number}'),
            [
                'round_number' => $endedRound,
            ]
        );

        $g->recordRoundEnded();
        $g->incrementRoundNumber();

        $mull = [];
        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $mull[$pid] = false;
        }
        $g->setMulliganUsed($mull);

        if (count($g->playersWithLocationSevenPlusCards()) > 0) {
            return EndScore::class;
        }
        $g->clearPromptClaimResumePlayerId();
        $leader = $g->getRoundLeaderId();
        $g->gamestate->changeActivePlayer($leader);
        $g->updateObjectiveConditions();

        return Gameplay::class;
    }
}
