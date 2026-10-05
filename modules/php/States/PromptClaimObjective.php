<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArcticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArcticExpeditions\Game;
use Bga\Games\BorealisArcticExpeditions\Material;
use Bga\Games\BorealisArcticExpeditions\States\ReplenishAnimalCard;

class PromptClaimObjective extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 14,
            type: StateType::MULTIPLE_ACTIVE_PLAYER,
            name: 'promptClaimObjective',
            description: clienttranslate('Waiting for players to claim objectives'),
            descriptionMyTurn: clienttranslate('${you}: claim objective or pass'),
        );
    }

    public function onEnteringState(?int $activePlayerId = null): mixed
    {
        $returnState = $this->game->getPromptClaimReturnState();
        $players = array_keys($this->game->getEligiblePendingObjectivePromptsByPlayer());
        if (empty($players)) {
            return $this->leavePromptState($returnState);
        }

        $this->game->gamestate->setPlayersMultiactive(array_map('intval', $players), $returnState, true);
        return null;
    }

    public function getArgs(): array
    {
        $eligible = $this->game->getEligiblePendingObjectivePromptsByPlayer();
        $objectivesData = Material::getObjectivesData();
        $pendingByPlayer = [];
        foreach ($eligible as $pid => $indices) {
            $pendingByPlayer[$pid] = [];
            foreach ($indices as $idx) {
                $oid = (int) (($this->game->getObjectivesState()[$idx]['id'] ?? 0));
                $pendingByPlayer[$pid][] = [
                    'index' => $idx,
                    'id' => $oid,
                    'title' => $objectivesData[$oid]['title'] ?? (string) $oid,
                ];
            }
        }

        $undoByPlayer = [];
        foreach (array_keys($eligible) as $pid) {
            $undoByPlayer[$pid] = $this->game->getUndoInfoForPlayer((int) $pid, 'promptClaim');
        }

        return [
            'pendingByPlayer' => $pendingByPlayer,
            'undoByPlayer' => $undoByPlayer,
        ];
    }

    private function ensurePlayerCanResolveObjective(int $playerId, int $objectiveIndex): void
    {
        $eligible = $this->game->getEligiblePendingObjectivePromptsByPlayer();
        if (! in_array($objectiveIndex, $eligible[$playerId] ?? [], true)) {
            throw new UserException(clienttranslate('This objective cannot be claimed at this time. You may only claim the current pending objective.'));
        }
    }

    #[PossibleAction]
    public function actClaimPromptObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $currentPlayerId,
        array $args,
    ): mixed {
        $this->ensurePlayerCanResolveObjective($currentPlayerId, $objective_index);
        $this->game->resolveObjectivePrompt($currentPlayerId, $objective_index, true);

        $remaining = $this->game->getEligiblePendingObjectivePromptsByPlayer()[$currentPlayerId] ?? [];
        if (! empty($remaining)) {
            return null;
        }

        return $this->finishPromptReturn($currentPlayerId);
    }

    #[PossibleAction]
    public function actSkipPromptObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $currentPlayerId,
        array $args,
    ): mixed {
        $this->ensurePlayerCanResolveObjective($currentPlayerId, $objective_index);
        $this->game->clearUndoSnapshot();
        $this->game->resolveObjectivePrompt($currentPlayerId, $objective_index, false);

        $remaining = $this->game->getEligiblePendingObjectivePromptsByPlayer()[$currentPlayerId] ?? [];
        if (! empty($remaining)) {
            return null;
        }

        return $this->finishPromptReturn($currentPlayerId);
    }

    #[PossibleAction]
    public function actUndo(int $currentPlayerId, array $args): mixed
    {
        return $this->game->performUndo($currentPlayerId, 'promptClaim');
    }

    /**
     * @param class-string $returnState
     */
    private function leavePromptState(string $returnState): mixed
    {
        $this->game->clearPendingObjectivePrompts();
        $this->prepareReturnTo($returnState, true);
        $this->game->clearPromptClaimReturnState();

        return $returnState;
    }

    private function finishPromptReturn(int $playerId): mixed
    {
        $returnState = $this->game->getPromptClaimReturnState();
        if ($returnState === ReplenishAnimalCard::class) {
            $this->game->setReplenishUndoBlocked(true);
        }
        // setPlayerNonMultiactive already transitions when this was the last player.
        // Returning the same state would enter nextPlayer a second time and skip the round leader.
        $finished = $this->game->gamestate->setPlayerNonMultiactive($playerId, $returnState);
        if ($finished) {
            $this->prepareReturnTo($returnState, false);
            $this->game->clearPromptClaimReturnState();
        }

        return null;
    }

    /**
     * @param class-string $returnState
     */
    private function prepareReturnTo(string $returnState, bool $leavingByStateReturn): void
    {
        if ($returnState === ReplenishAnimalCard::class && $leavingByStateReturn) {
            $this->game->setReplenishUndoBlocked(true);
        }
        if ($returnState !== NextPlayer::class) {
            $this->game->restorePromptClaimResumePlayer();
            $this->game->clearPromptClaimResumePlayerId();
        }
    }

    public function zombie(int $playerId)
    {
        $pending = $this->game->getEligiblePendingObjectivePromptsByPlayer()[$playerId] ?? [];
        if (empty($pending)) {
            return $this->finishPromptReturn($playerId);
        }

        return $this->actSkipPromptObjective((int) $pending[0], $playerId, $this->getArgs());
    }
}
