package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"
)

var (
	amino = codec.NewLegacyAmino()

	// ModuleCdc references the global x/deployment module codec. Note, the codec should
	// ONLY be used in certain instances of tests and for JSON encoding as Amino is
	// still used for that purpose.
	//
	// The actual codec used for serialization should be provided to x/swingset and
	// defined at the application level.
	ModuleCdc = codec.NewProtoCodec(cdctypes.NewInterfaceRegistry())
)

func init() {
	RegisterCodec(amino)
	cryptocodec.RegisterCrypto(amino)
	amino.Seal()
}

// RegisterCodec registers concrete types on the Amino codec
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgDeliverInbound{}, ModuleName+"/DeliverInbound", nil)
	cdc.RegisterConcrete(&MsgProvision{}, ModuleName+"/Provision", nil)
	cdc.RegisterConcrete(&MsgWalletAction{}, ModuleName+"/WalletAction", nil)
	cdc.RegisterConcrete(&MsgWalletSpendAction{}, ModuleName+"/WalletSpendAction", nil)
}

// RegisterInterfaces registers the x/swingset interfaces types with the interface registry
func RegisterInterfaces(registry cdctypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgDeliverInbound{},
		&MsgProvision{},
		&MsgWalletAction{},
		&MsgWalletSpendAction{},
	)
	registry.RegisterImplementations(
		(*govtypes.Content)(nil),
		&CoreEvalProposal{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &_Msg_serviceDesc)
}
