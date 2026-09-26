<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArcticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArcticExpeditions\Game;

class NextPlayer extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 90,
            type: StateType::GAME,
            name: 'nextPlayer',
            updateGameProgression: true,
        );
    }

    public function onEnteringState(int $activePlayerId)
    {
        $g = $this->game;
        $resumePlayer = $g->getPromptClaimResumePlayerId();
        $turnPlayer = $resumePlayer > 0 ? $resumePlayer : $activePlayerId;

        if ($g->hasPendingObjectivePrompts()) {
            $g->setPromptClaimReturnState(Game::PROMPT_RETURN_NEXT_PLAYER);
            if ($g->getPromptClaimResumePlayerId() <= 0) {
                $g->setPromptClaimResumePlayerId($turnPlayer);
            }

            return PromptClaimObjective::class;
        }

        $g->clearPromptClaimResumePlayerId();
        $g->giveExtraTime($turnPlayer);

        $leader = $g->getRoundLeaderId();
        $next = $g->getPlayerAfter($turnPlayer);
        if ($next === $leader) {
            return EndOfRound::class;
        }
        $g->gamestate->changeActivePlayer($next);

        return Gameplay::class;
    }
}
