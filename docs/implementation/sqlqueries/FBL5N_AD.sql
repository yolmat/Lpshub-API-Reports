WITH Rec as (
					SELECT 
						X1."TransId",
						X1."InstID",
						X1."TransRowId",
						X1."ReconNum",
						X1."ReconSum",
						X0."ReconDate",
						X1."IsCredit"
						FROM
						OITR X0
						INNER JOIN ITR1 X1 ON X0."ReconNum" = X1."ReconNum" AND X0."Canceled" = 'N'
					
					),



 Base as (
	SELECT --top 10
	T1."BPLId",
	T3."BPLName",
	T3."AliasName",
	T0."TransType",
	T0."CreatedBy",
	CASE T0."TransType" 
		WHEN '30' THEN 'LC'
		WHEN '13' THEN 'NS'
		WHEN '24' THEN 'CR'
		WHEN '321' THEN 'RI'
		ELSE TO_VARCHAR(T0."TransType")
	END AS "Tipo de Documento",
	T2."CardCode" as "CodPN",
	T2."CardName" as "PN",
	T2."U_UPPTaxId" AS "Código do PN",
	T0."U_UPP_CodigoParcelaContrato" as "Contrato",
	'' AS "PV",
	T0."TransId" AS "LCM",
	T0."Number" as "LCMInterno",
	CASE T0."TransType" 
		WHEN '30' THEN T1."Line_ID"
		WHEN '13' THEN T1."SourceLine"
		WHEN '24' THEN T1."SourceLine"
		WHEN '321' THEN T1."Line_ID"
		ELSE T1."SourceLine"
	END as "SourceLine",
	T1."RefDate",
	T1."DueDate",
	T1."TaxDate",
	T1."Debit" - T1."Credit" as "Valor",
	T4."ReconNum",
	T4."ReconSum",
	T4."ReconDate",
	T1."LineMemo",
	T1."Ref1",
	T1."Ref2",
	T1."Ref3Line",
	T0."CreateDate",
	concat(concat(left(right(concat('0', to_varchar(T0."CreateTime")), 4), 2), ':'), 
	right(right(concat('0', to_varchar(T0."CreateTime")), 4), 2)) as "CreateTime",
	T0."UserSign",
	T1."ContraAct",
	ifnull(T5."AcctName", T6."CardName") as "AcctName"
	
	
	
	FROM
		OJDT T0
		INNER JOIN JDT1 T1 ON T0."TransId" = T1."TransId"
		INNER JOIN OCRD T2 ON T1."ShortName" = T2."CardCode"
		LEFT JOIN OBPL T3 ON T1."BPLId" = T3."BPLId"
		LEFT JOIN Rec T4 ON T0."TransId" = T4."TransId" AND IFNULL(T1."Line_ID", 0) = T4."TransRowId"
		LEFT JOIN OACT T5 ON T1."ContraAct" = T5."AcctCode"
		LEFT JOIN OCRD T6 ON T1."ContraAct" = T6."CardCode"
		
		/*Vinculo com NF 13*/
		--LEFT JOIN OINV T100 ON T0."TransId" = '13' and 
		
	WHERE
		T2."CardType" = 'C'
		--AND T2."CardCode" = 'CPF000154'
		--AND T0."RefDate" >= '2025-08-01'
		--and T44."Canceled" = 'N'
		--and T0."TransId" = '4213943'
),



Documentos (
    "BPLId",
    "BPLName",
    "Empresa",
    "TransType",
    "CreatedBy",
    "DocNum",
    "Tipo de Documento",
    "CodPN",
    "PN",
    "Código do PN",
    "Contrato",
    "PV",
    "LCM",
    "LCMInterno",
    "U_UPP_NumeroParcela",
    "SourceLine",
    "RefDate",
    "DueDate",
    "TaxDate",
    "Valor",
    "ReconNum",
    "ReconSum",
    "ReconDate",
    "LineMemo",
    "Ref1",
    "Ref2",
    "Ref3Line",
    "CreateDate",
    "CreateTime",
    "UserSign",
    "ContraAct",
    "AcctName"
) AS (
SELECT 
		T1."BPLId",
		T3."BPLName",
		TO_VARCHAR(T3."AliasName"),
		0, -- "TransType"
		0, --"CreatedBy"
		T0."Number" AS "DocNum",
		'AD', --"Tipo de Documento" 
		T2."CardCode",
		T2."CardName",
		T2."U_UPPTaxId" AS "Código do PN",
		'', --"Contrato" 
		'', --"PV"
		T0."TransId", --"LCM"
		0, --"LCMInterno"
		0, --"U_UPP_NumeroParcela"
		0,  --SourceLine
		T1."RefDate",
		T1."DueDate",
		T1."TaxDate",
		(sum(T1."Credit" * -1) + sum(T1."Debit")) as "Valor",
		0, --"ReconNum"
		0, --"ReconSum",
		'', --"ReconDate"
		T1."LineMemo",
		T1."Ref1",
		T1."Ref2",
		T1."Ref3Line",
		T0."CreateDate",
		concat(concat(left(right(concat('0', to_varchar(T0."CreateTime")), 4), 2), ':'), 
		right(right(concat('0', to_varchar(T0."CreateTime")), 4), 2)) as "CreateTime",
		T0."UserSign",
		T1."ContraAct",
		ifnull(T5."AcctName", T6."CardName") as "AcctName"
		FROM
		OJDT T0
		INNER JOIN JDT1 T1 ON T0."TransId" = T1."TransId"
		INNER JOIN OCRD T2 ON T1."ContraAct" = T2."CardCode"
		LEFT JOIN OBPL T3 ON T1."BPLId" = T3."BPLId"
		LEFT JOIN OACT T5 ON T1."ContraAct" = T5."AcctCode"
		LEFT JOIN OCRD T6 ON T1."ContraAct" = T6."CardCode"
		WHERE
		T1."Account" = '2.1.10.01.001'
		group by 
		T1."BPLId",
		T3."BPLName",
		t0."Number",
		TO_VARCHAR(T3."AliasName"),
		T2."CardCode",
		T2."CardName", 
		T2."U_UPPTaxId",
		T0."TransId",
		T1."RefDate",
		T1."DueDate",
		T1."TaxDate",
		T1."LineMemo",
		T1."Ref1",
		T1."Ref2",
		T1."Ref3Line",
		T0."CreateDate",
		T0."CreateTime",
		T0."UserSign",
		T1."ContraAct",
		T5."AcctName", 
		T6."CardName"

)


select
	B0."BPLId" AS "Cod.Filial",
	B0."BPLName" AS "Razão Filial" ,
	B0."Empresa",
	--B0."TransType",
	B0."CreatedBy" as "DocOrigem",
	B0."DocNum" as "NºDoc",
	B0."Tipo de Documento",
	B0."CodPN",
	B0."PN",
	B0."Código do PN",
	B0."Contrato", 
	B0."PV",
	B0."LCM",
	B0."LCMInterno",
	B0."U_UPP_NumeroParcela" as "NºParcela",
	--B0."SourceLine" as "Linha",
	B0."RefDate" as "Dt Lançamento",
	B0."DueDate" as "Dt Vencimento",
	B0."TaxDate" AS "Dt Documento",
	B0."Valor",
	B0."ReconNum" as "nºDocumento de Compensação",
	B0."ReconSum" as "Vlr Reconciliado",
	B0."ReconDate" AS "Dt Reconciliação",
	B0."LineMemo" as "Observações",
	B0."Ref1" as "Chv.ref.1",
	B0."Ref2" as "Chv.ref.2",
	B0."Ref3Line" as "Chv.ref.3",
	B0."CreateDate" as "Dt.Executou lçmto",
	B0."CreateTime" as "Hora Executou lçmto",
	B1."U_NAME" AS "Criado por" ,
	B0."ContraAct" as "Conta Contra partida",
	B0."AcctName" as "Desc.Conta Contra partida"
from Documentos B0
LEFT JOIN OUSR B1 ON B0."UserSign" = B1."USERID"
--WHERE
--B0."Tipo de Documento" LIKE  'DS%'
--B0."TransType" NOT IN (/*'30', '13', '24', */'321')
--and ifnull(B0."Contrato", '') <> ''

WHERE
    (:bplIdAtivo = 0 OR B0."BPLId" BETWEEN :bplIdInicial AND :bplIdFinal)
    AND (:refDateAtivo = 0 OR B0."RefDate" BETWEEN :refDateInicial AND :refDateFinal)
    AND (:dueDateAtivo = 0 OR B0."DueDate" BETWEEN :dueDateInicial AND :dueDateFinal)
AND (B0."CodPN" IN (:c0, :c1, :c2, :c3, :c4, :c5, :c6, :c7, :c8, :c9, :c10, :c11, :c12, :c13, :c14, :c15, :c16, :c17, :c18, :c19, :c20, :c21, :c22, :c23, :c24) OR (B0."CodPN" >= :clienteInicial AND B0."CodPN" <= :clienteFinal))
